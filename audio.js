/* ---------------------------------------------------------
   AUDIO ENGINE
--------------------------------------------------------- */
let audioCtx = null;
let osc = null;
let gainNode = null;
let panner = null;

const fMin = 200;
const fMax = 8000;

let intervals = [];
let currentInterval = null;

const parentMap = new Map();

function intervalKey(intv) {
    return `${intv.left},${intv.right}`;
}

function logFreqFromX(x) {
    return fMin * Math.pow(fMax / fMin, x);
}

function xFromFreq(freq) {
    return Math.log(freq / fMin) / Math.log(fMax / fMin);
}

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    store.setState({ status: "Audio geactiveerd. Voer nu je systeemvolume in." });
}

function startOsc(freq, gain) {
    stopOsc();
    osc = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
    const ear = store.getState().ear;
    panner = new StereoPannerNode(audioCtx, { pan: ear === "left" ? -1 : 1 });

    osc.type = "sine";
    osc.frequency.value = freq;
    gainNode.gain.value = gain;

    osc.connect(panner).connect(gainNode).connect(audioCtx.destination);
    osc.start();
}

function stopOsc() {
    if (osc) {
        try { osc.stop(); } catch (e) { }
        osc.disconnect();
        osc = null;
    }
}

function setFreqFromX(x) {
    const currentX = Math.min(1, Math.max(0, x));
    const f = logFreqFromX(currentX);
    if (osc) osc.frequency.value = f;
    store.setState({ currentX });
    return f;
}

function setGain(g) {
    const currentGain = Math.max(0.0000001, g);
    if (gainNode) gainNode.gain.value = currentGain;
    store.setState({ currentGain });
}

/* ---------------------------------------------------------
   NAVIGATION
--------------------------------------------------------- */
function computeTreeStatus(intv) {
    let depth = 0;
    let key = intervalKey(intv);
    while (parentMap.has(key)) {
        depth++;
        key = intervalKey(parentMap.get(key));
    }
    const total = Math.pow(2, depth);
    const index = Math.round(intv.left * total);
    return { depth, index, total };
}

function treeLabel(intv) {
    const t = computeTreeStatus(intv);
    return `d:${t.depth} i:${t.index}/${t.total}`;
}

function navigateTo(intv) {
    currentInterval = intv;
    const mid = (intv.left + intv.right) / 2;
    const f = logFreqFromX(mid);
    stopOsc();
    const state = store.getState();
    startOsc(f, state.calibrationGain * 0.5);
    store.setState({ currentX: mid, info: `Test freq ≈ ${f.toFixed(0)} Hz (${state.ear})  [${treeLabel(intv)}]` });
}

function goUp() {
    const key = intervalKey(currentInterval);
    const parent = parentMap.get(key);
    if (parent) navigateTo(parent);
}

function goDown() {
    const mid = (currentInterval.left + currentInterval.right) / 2;
    const c1 = { left: currentInterval.left, right: mid };
    const c2 = { left: mid, right: currentInterval.right };
    parentMap.set(intervalKey(c1), currentInterval);
    parentMap.set(intervalKey(c2), currentInterval);
    navigateTo(c1);
}

function goLeft() {
    const key = intervalKey(currentInterval);
    const parent = parentMap.get(key);
    if (!parent) return;
    const mid = (parent.left + parent.right) / 2;
    const isLeft = currentInterval.left === parent.left;
    if (!isLeft) navigateTo({ left: parent.left, right: mid });
}

function goRight() {
    const key = intervalKey(currentInterval);
    const parent = parentMap.get(key);
    if (!parent) return;
    const mid = (parent.left + parent.right) / 2;
    const isLeft = currentInterval.left === parent.left;
    if (isLeft) navigateTo({ left: mid, right: parent.right });
}

/* ---------------------------------------------------------
   INTERVAL QUEUE
--------------------------------------------------------- */
function initIntervals() {
    intervals = [{ left: 0.0, right: 1.0 }];
}

function nextInterval() {
    if (intervals.length === 0) return null;
    return intervals.shift();
}

/* ---------------------------------------------------------
   TESTFLOW
--------------------------------------------------------- */
function startCalibration() {
    store.setState({ mode: "calibrate" });
    startOsc(1000, 0.0001);
    store.setState({ status: "Kalibratie: ↑/↓ volume, spatie = bevestigen." });
}

function finishCalibration() {
    const state = store.getState();
    store.setState({ calibrationGain: state.currentGain, calibrationEar: state.ear, mode: "idle", status: "Kalibratie klaar. Start nu de testfase." });
    stopOsc();
}

function startTest() {
    store.setState({ mode: "test" });
    parentMap.clear();
    initIntervals();
    currentInterval = nextInterval();
    testInterval(currentInterval);
}

function testInterval(intv) {
    const mid = (intv.left + intv.right) / 2;
    const state = store.getState();
    const f = logFreqFromX(mid);
    startOsc(f, state.calibrationGain * 0.5);
    store.setState({ currentX: mid, info: `Test freq ≈ ${f.toFixed(0)} Hz (${state.ear})  [${treeLabel(intv)}]` });
}

function markThreshold() {
    const state = store.getState();
    const f = logFreqFromX(state.currentX);
    const point = { x: state.currentX, freq: f, gain: state.currentGain };

    const thresholdsLeft = [...state.thresholdsLeft];
    const thresholdsRight = [...state.thresholdsRight];

    if (state.ear === "left") thresholdsLeft.push(point);
    else thresholdsRight.push(point);

    thresholdsLeft.sort((a, b) => a.freq - b.freq);
    thresholdsRight.sort((a, b) => a.freq - b.freq);

    store.setState({ thresholdsLeft, thresholdsRight });

    intervals.push(...splitInterval(currentInterval));

    currentInterval = nextInterval();
    if (!currentInterval) {
        stopOsc();
        store.setState({ status: "Alle intervallen getest. Start nu de sweep." });
        return;
    }
    testInterval(currentInterval);
}

function splitInterval(intv) {
    const mid = (intv.left + intv.right) / 2;
    const c1 = { left: intv.left, right: mid };
    const c2 = { left: mid, right: intv.right };
    parentMap.set(intervalKey(c1), intv);
    parentMap.set(intervalKey(c2), intv);
    return [c1, c2];
}

/* ---------------------------------------------------------
   SWEEP
--------------------------------------------------------- */
async function playOnce(freq, gain, ms) {
    return new Promise(resolve => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        const ear = store.getState().ear;
        const p = new StereoPannerNode(audioCtx, { pan: ear === "left" ? -1 : 1 });

        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = gain;

        o.connect(p).connect(g).connect(audioCtx.destination);
        o.start();

        setTimeout(() => {
            o.stop();
            resolve();
        }, ms);
    });
}

async function startSweep() {
    store.setState({ mode: "sweep", status: "Sweep bezig..." });
    stopOsc();

    const state = store.getState();
    const all = [...state.thresholdsLeft, ...state.thresholdsRight].sort((a, b) => a.freq - b.freq);

    for (const t of all) {
        const ear = state.thresholdsLeft.includes(t) ? "left" : "right";
        store.setState({ ear });
        store.setState({ info: `Sweep: ${t.freq.toFixed(0)} Hz (${ear})` });
        await playOnce(t.freq, t.gain * 0.8, 200);
        await playOnce(t.freq, t.gain * 1.2, 200);
    }

    store.setState({ status: "Sweep klaar. Download nu de resultaten." });
}

/* ---------------------------------------------------------
   DOWNLOAD
--------------------------------------------------------- */
function downloadResults() {
    const state = store.getState();
    const data = {
        timestamp: new Date().toISOString(),
        os: navigator.userAgent,
        systemVolume: state.systemVolume,
        ears: {
            left: {
                calibration: state.calibrationEar === "left" ? { frequency: state.calibrationFreq, gain: state.calibrationGain } : null,
                thresholds: state.thresholdsLeft,
            },
            right: {
                calibration: state.calibrationEar === "right" ? { frequency: state.calibrationFreq, gain: state.calibrationGain } : null,
                thresholds: state.thresholdsRight,
            },
        },
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "hoortest_" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
}
