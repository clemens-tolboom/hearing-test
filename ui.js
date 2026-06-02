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
    [250, 500, 1000, 2000, 4000, 8000].forEach(f => {
        const x = 40 + xFromFreq(f) * (w - 60);
        ctx2d.fillRect(x, h - 20, 1, 5);
        ctx2d.fillText(f.toString(), x - 10, h - 25);
    });

    function drawList(list, color) {
        ctx2d.fillStyle = color;
        list.forEach(t => {
            const x = 40 + t.x * (w - 60);
            const y = (h - 20) - Math.log10(t.gain / state.calibrationGain + 1e-7) * 40;
            ctx2d.beginPath();
            ctx2d.arc(x, y, 3, 0, Math.PI * 2);
            ctx2d.fill();
        });
    }

    drawList(state.thresholdsLeft, "#2a5");
    drawList(state.thresholdsRight, "#fa3");

    const xCur = 40 + state.currentX * (w - 60);
    const yCur = (h - 20) - Math.log10(state.currentGain / state.calibrationGain + 1e-7) * 40;
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
        if (e.key === " ") {
            markThreshold();
            document.getElementById("btnSweep").disabled = false;
            document.getElementById("btnDownload").disabled = false;
        }
    }
});
