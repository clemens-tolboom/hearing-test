/* ---------------------------------------------------------
   DOM REFERENCES
--------------------------------------------------------- */
const statusEl = document.getElementById("status");
const infoEl = document.getElementById("info");
const canvas = document.getElementById("chart");
const ctx2d = canvas.getContext("2d");

/* ---------------------------------------------------------
   RENDER
--------------------------------------------------------- */
function drawChart(state) {
    const w = canvas.width;
    const h = canvas.height;

    const chartTop = 10;
    const chartBottom = h - 20;
    const chartHeight = chartBottom - chartTop;
    const dBMin = -60;
    const dBMax = 20;

    function dBtoY(dB) {
        const y = chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight;
        return Math.max(chartTop, Math.min(chartBottom, y));
    }

    function gainToDB(gain) {
        return 20 * Math.log10(gain / state.calibrationGain + 1e-10);
    }

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    // y-axis gridlines
    ctx2d.strokeStyle = "#333";
    ctx2d.fillStyle = "#777";
    ctx2d.font = "11px system-ui";
    [-60, -40, -20, 0].forEach(dB => {
        const y = chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight;
        ctx2d.beginPath();
        ctx2d.moveTo(40, y);
        ctx2d.lineTo(w - 10, y);
        ctx2d.stroke();
        ctx2d.fillText(dB + " dB", 3, y + 4);
    });

    // axes
    ctx2d.strokeStyle = "#444";
    ctx2d.beginPath();
    ctx2d.moveTo(40, chartTop);
    ctx2d.lineTo(40, chartBottom);
    ctx2d.lineTo(w - 10, chartBottom);
    ctx2d.stroke();

    // x-axis freq grid
    ctx2d.fillStyle = "#555";
    ctx2d.font = "12px system-ui";
    [250, 500, 1000, 2000, 4000, 8000].forEach(f => {
        const x = 40 + xFromFreq(f) * (w - 60);
        ctx2d.fillRect(x, chartBottom, 1, 5);
        ctx2d.fillText(f.toString(), x - 10, chartBottom + 14);
    });

    function drawList(list, color) {
        ctx2d.fillStyle = color;
        list.forEach(t => {
            const x = 40 + t.x * (w - 60);
            const dB = gainToDB(t.gain);
            const y = dBtoY(dB);
            ctx2d.beginPath();
            ctx2d.arc(x, y, 3, 0, Math.PI * 2);
            ctx2d.fill();
        });
    }

    drawList(state.thresholdsLeft, "#2a5");
    drawList(state.thresholdsRight, "#fa3");

    // current point
    const xCur = 40 + state.currentX * (w - 60);
    const dB = gainToDB(state.currentGain);
    const yCur = dBtoY(dB);
    ctx2d.fillStyle = "#58a";
    ctx2d.beginPath();
    ctx2d.arc(xCur, yCur, 4, 0, Math.PI * 2);
    ctx2d.fill();
}

function render(state) {
    drawChart(state);
    statusEl.textContent = state.status;
    infoEl.textContent = state.info;
}

/* ---------------------------------------------------------
   SUBSCRIBE
--------------------------------------------------------- */
store.subscribe(render);
render(store.getState());

/* ---------------------------------------------------------
   UI BUTTONS
--------------------------------------------------------- */
document.getElementById("btnInit").onclick = () => {
    initAudio();
};

document.getElementById("inputVolume").oninput = () => {
    const v = parseInt(document.getElementById("inputVolume").value, 10);
    if (!isNaN(v) && v >= 0 && v <= 100) {
        store.setState({ systemVolume: v, status: "Systeemvolume opgeslagen. Start kalibratie." });
        document.getElementById("btnCalibrate").disabled = false;
    }
};

document.getElementById("btnCalibrate").onclick = () => startCalibration();
document.getElementById("btnTest").onclick = () => {
    document.getElementById("btnCalibrate").disabled = true;
    startTest();
};
document.getElementById("btnSweep").onclick = () => startSweep();
document.getElementById("btnDownload").onclick = () => downloadResults();

/* ---------------------------------------------------------
   KEYBOARD
--------------------------------------------------------- */
window.addEventListener("keydown", e => {
    if (!audioCtx) return;
    const state = store.getState();

    if (e.key === "e" || e.key === "E") {
        const ear = state.ear === "left" ? "right" : "left";
        store.setState({ ear });
        if (panner) panner.pan.value = ear === "left" ? -1 : 1;
        return;
    }

    if (state.mode === "calibrate") {
        if (e.key === "ArrowUp") setGain(state.currentGain * 1.1);
        if (e.key === "ArrowDown") setGain(state.currentGain / 1.1);
        if (e.key === " ") {
            finishCalibration();
            document.getElementById("btnTest").disabled = false;
        }
    }

    if (state.mode === "test") {
        if (e.key === "ArrowUp") setGain(state.currentGain * 1.1);
        if (e.key === "ArrowDown") setGain(state.currentGain / 1.1);
        if (e.key === "n" || e.key === "N") { skipInterval(); return; }
        if (e.key === "p" || e.key === "P") { prevInterval(); return; }
        if (e.key === " ") {
            markThreshold();
            document.getElementById("btnSweep").disabled = false;
            document.getElementById("btnDownload").disabled = false;
        }
    }
});
