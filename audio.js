/* ---------------------------------------------------------
   AUDIO + MODEL
--------------------------------------------------------- */
let audioCtx = null;
let osc = null;
let gainNode = null;
let panner = null;

const fMin = 200;
const fMax = 8000;

let calibrationGain = 0.001;

let currentGain = 0.0001;
let currentX = 0.5;

let ear = "left";
let mode = "idle";

let systemVolume = null;

let intervals = [];
let currentInterval = null;

let thresholdsLeft = [];
let thresholdsRight = [];

function logFreqFromX(x) {
    return fMin * Math.pow(fMax / fMin, x);
}

function xFromFreq(freq) {
    return Math.log(freq / fMin) / Math.log(fMax / fMin);
}

function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    setStatus("Audio geactiveerd. Voer nu je systeemvolume in.");
}

function startOsc(freq, gain) {
    stopOsc();
    osc = audioCtx.createOscillator();
    gainNode = audioCtx.createGain();
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
    currentX = Math.min(1, Math.max(0, x));
    const f = logFreqFromX(currentX);
    if (osc) osc.frequency.value = f;
    return f;
}

function setGain(g) {
    currentGain = Math.max(0.0000001, g);
    if (gainNode) gainNode.gain.value = currentGain;
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

function splitInterval(intv) {
    const mid = (intv.left + intv.right) / 2;
    return [
        { left: intv.left, right: mid },
        { left: mid, right: intv.right }
    ];
}

/* ---------------------------------------------------------
   TESTFLOW
--------------------------------------------------------- */
function startCalibration() {
    mode = "calibrate";
    startOsc(1000, 0.0001);
    setStatus("Kalibratie: ↑/↓ volume, spatie = bevestigen.");
}

function finishCalibration() {
    calibrationGain = currentGain;
    stopOsc();
    mode = "idle";
    setStatus("Kalibratie klaar. Start nu de testfase.");
}

function startTest() {
    mode = "test";
    initIntervals();
    currentInterval = nextInterval();
    testInterval(currentInterval);
}

function testInterval(intv) {
    const mid = (intv.left + intv.right) / 2;
    currentX = mid;
    const f = logFreqFromX(mid);
    startOsc(f, calibrationGain * 0.5);
    setInfo(`Test freq ≈ ${f.toFixed(0)} Hz (${ear})`);
    drawChart();
}

function markThreshold() {
    const f = logFreqFromX(currentX);
    const point = { x: currentX, freq: f, gain: currentGain };

    if (ear === "left") thresholdsLeft.push(point);
    else thresholdsRight.push(point);

    thresholdsLeft.sort((a, b) => a.freq - b.freq);
    thresholdsRight.sort((a, b) => a.freq - b.freq);

    intervals.push(...splitInterval(currentInterval));

    currentInterval = nextInterval();
    if (!currentInterval) {
        stopOsc();
        setStatus("Alle intervallen getest. Start nu de sweep.");
        return;
    }
    testInterval(currentInterval);
}

/* ---------------------------------------------------------
   SWEEP
--------------------------------------------------------- */
async function playOnce(freq, gain, ms) {
    return new Promise(resolve => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
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
    mode = "sweep";
    stopOsc();
    setStatus("Sweep bezig...");

    const all = [...thresholdsLeft, ...thresholdsRight].sort((a, b) => a.freq - b.freq);

    for (const t of all) {
        ear = thresholdsLeft.includes(t) ? "left" : "right";
        setInfo(`Sweep: ${t.freq.toFixed(0)} Hz (${ear})`);
        await playOnce(t.freq, t.gain * 0.8, 200);
        await playOnce(t.freq, t.gain * 1.2, 200);
    }

    setStatus("Sweep klaar. Download nu de resultaten.");
}

/* ---------------------------------------------------------
   DOWNLOAD
--------------------------------------------------------- */
function downloadResults() {
    const data = {
        timestamp: new Date().toISOString(),
        os: navigator.userAgent,
        systemVolume: systemVolume,
        leftEar: thresholdsLeft,
        rightEar: thresholdsRight
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "hoortest_" + Date.now() + ".json";
    a.click();
    URL.revokeObjectURL(url);
}
