/* ---------------------------------------------------------
   DOM REFERENCES
--------------------------------------------------------- */
const statusEl = document.getElementById("status");
const infoEl = document.getElementById("info");
const canvas = document.getElementById("chart");
const ctx2d = canvas.getContext("2d");

document.getElementById("version").textContent = "v" + APP_VERSION;

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
    const dBMax = 40;

    function dBtoY(dB) {
        const y = chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight;
        return Math.max(chartTop, Math.min(chartBottom, y));
    }

    ctx2d.clearRect(0, 0, w, h);
    ctx2d.fillStyle = "#000";
    ctx2d.fillRect(0, 0, w, h);

    // y-axis gridlines
    ctx2d.strokeStyle = "#333";
    ctx2d.fillStyle = "#777";
    ctx2d.font = "11px system-ui";
    Array.from({ length: (dBMax - dBMin) / 20 + 1 }, (_, i) => dBMin + i * 20).forEach(dB => {
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
    Array.from({ length: 6 }, (_, i) => 125 * Math.pow(2, i)).forEach(f => {
        const x = 40 + xFromFreq(f) * (w - 60);
        ctx2d.fillRect(x, chartBottom, 1, 5);
        ctx2d.fillText(f.toString(), x - 10, chartBottom + 14);
    });

    function drawList(list, color, calGain) {
        ctx2d.fillStyle = color;
        list.forEach(t => {
            const x = 40 + t.x * (w - 60);
            const dB = 20 * Math.log10(t.gain / calGain + 1e-10);
            const y = dBtoY(dB);
            ctx2d.beginPath();
            ctx2d.arc(x, y, 3, 0, Math.PI * 2);
            ctx2d.fill();
        });
    }

    drawList(state.thresholdsLeft, "#2a5", state.calibrationGainLeft);
    drawList(state.thresholdsRight, "#fa3", state.calibrationGainRight);

    // current point
    const xCur = 40 + state.currentX * (w - 60);
    const dB = 20 * Math.log10(state.currentGain / (state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight) + 1e-10);
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
updateAudioBtn();
updateCalibrateBtn();

document.getElementById("inputVolume").oninput = () => {
    const v = parseInt(document.getElementById("inputVolume").value, 10);
    if (!isNaN(v) && v >= 0 && v <= 100) {
        store.setState({ systemVolume: v });
    }
};

document.getElementById("btnCalibrate").onclick = () => startCalibration();
document.getElementById("btnTest").onclick = () => {
    document.getElementById("btnCalibrate").disabled = true;
    document.getElementById("btnTest").disabled = true;
    startTest();
};
document.getElementById("btnSweep").onclick = () => startSweep();
document.getElementById("btnDownload").onclick = () => downloadResults();

/* ---------------------------------------------------------
   MOUSE WHEEL — volume
--------------------------------------------------------- */
canvas.addEventListener("wheel", e => {
    ensureAudio();
    if (audioCtx.state !== 'running') return;
    e.preventDefault();
    const state = store.getState();
    if (e.deltaY < 0) setGain(state.currentGain * 1.1);
    else setGain(state.currentGain / 1.1);
});

/* ---------------------------------------------------------
   KEYBOARD
--------------------------------------------------------- */
window.addEventListener("keydown", e => {
    ensureAudio();
    if (audioCtx.state !== 'running') return;
    const state = store.getState();

    if (e.key === "e" || e.key === "E") {
        const ear = state.ear === "left" ? "right" : "left";
        store.setState({ ear });
        if (panner) panner.pan.value = ear === "left" ? -1 : 1;
        if (state.mode === "test") {
            playCurrentNote();
            return;
        }
        if (state.mode === "calibrate") {
            store.setState({ status: `Kalibratie (${ear}): ↑/↓ volume, E=wissel oor, spatie = bevestigen.` });
        }
        return;
    }

    if (state.mode === "calibrate") {
        if (e.key === "ArrowUp") setGain(state.currentGain * 1.1);
        if (e.key === "ArrowDown") setGain(state.currentGain / 1.1);
        if (e.key === " ") finishCalibration();
    }

    if (state.mode === "test") {
        if (e.key === "ArrowRight") nextNote();
        if (e.key === "ArrowLeft") prevNote();
        if (e.key === " ") markThreshold();
    }
});
