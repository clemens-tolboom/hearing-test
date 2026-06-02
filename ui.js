/* ---------------------------------------------------------
   DOM REFERENCES
--------------------------------------------------------- */
const statusEl = document.getElementById("status");
const infoEl = document.getElementById("info");
const canvas = document.getElementById("chart");
const ctx2d = canvas.getContext("2d");

function setStatus(msg) { statusEl.textContent = msg; }
function setInfo(msg) { infoEl.textContent = msg; }

/* ---------------------------------------------------------
   CHART
--------------------------------------------------------- */
function drawChart() {
    const w = canvas.width;
    const h = canvas.height;

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    ctx2d.strokeStyle = "#444";
    ctx2d.beginPath();
    ctx2d.moveTo(40, 10);
    ctx2d.lineTo(40, h - 20);
    ctx2d.lineTo(w - 10, h - 20);
    ctx2d.stroke();

    ctx2d.fillStyle = "#555";
    const freqs = [250, 500, 1000, 2000, 4000, 8000];
    freqs.forEach(f => {
        const x = 40 + xFromFreq(f) * (w - 60);
        ctx2d.fillRect(x, h - 20, 1, 5);
        ctx2d.fillText(f.toString(), x - 10, h - 25);
    });

    function drawList(list, color) {
        ctx2d.fillStyle = color;
        list.forEach(t => {
            const x = 40 + t.x * (w - 60);
            const y = (h - 20) - Math.log10(t.gain / calibrationGain + 1e-7) * 40;
            ctx2d.beginPath();
            ctx2d.arc(x, y, 3, 0, Math.PI * 2);
            ctx2d.fill();
        });
    }

    drawList(thresholdsLeft, "#2a5");
    drawList(thresholdsRight, "#fa3");

    const xCur = 40 + currentX * (w - 60);
    const yCur = (h - 20) - Math.log10(currentGain / calibrationGain + 1e-7) * 40;
    ctx2d.fillStyle = "#58a";
    ctx2d.beginPath();
    ctx2d.arc(xCur, yCur, 4, 0, Math.PI * 2);
    ctx2d.fill();
}

/* ---------------------------------------------------------
   UI BUTTONS
--------------------------------------------------------- */
document.getElementById("btnInit").onclick = () => {
    initAudio();
    document.getElementById("btnVolume").disabled = false;
};

document.getElementById("btnVolume").onclick = () => {
    systemVolume = prompt("Voer je systeemvolume in (0–100):");
    document.getElementById("btnCalibrate").disabled = false;
    setStatus("Systeemvolume opgeslagen. Start kalibratie.");
};

document.getElementById("btnCalibrate").onclick = () => startCalibration();
document.getElementById("btnTest").onclick = () => startTest();
document.getElementById("btnSweep").onclick = () => startSweep();
document.getElementById("btnDownload").onclick = () => downloadResults();

/* ---------------------------------------------------------
   KEYBOARD
--------------------------------------------------------- */
window.addEventListener("keydown", e => {
    if (!audioCtx) return;

    if (e.key === "e" || e.key === "E") {
        ear = ear === "left" ? "right" : "left";
        if (panner) panner.pan.value = ear === "left" ? -1 : 1;
        return;
    }

    if (mode === "calibrate") {
        if (e.key === "ArrowUp") setGain(currentGain * 1.1);
        if (e.key === "ArrowDown") setGain(currentGain / 1.1);
        if (e.key === " ") {
            finishCalibration();
            document.getElementById("btnTest").disabled = false;
        }
        drawChart();
    }

    if (mode === "test") {
        if (e.key === "ArrowUp") setGain(currentGain * 1.1);
        if (e.key === "ArrowDown") setGain(currentGain / 1.1);
        if (e.key === " ") {
            markThreshold();
            document.getElementById("btnSweep").disabled = false;
            document.getElementById("btnDownload").disabled = false;
        }
        drawChart();
    }
});
