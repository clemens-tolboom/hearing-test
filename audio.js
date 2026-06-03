/* ---------------------------------------------------------
   AUDIO ENGINE
--------------------------------------------------------- */
let audioCtx = null;
let osc = null;
let gainNode = null;
let panner = null;

let pianoNotes = [];
let currentNoteIndex = 0;
let midiLower = 55;
let midiHigher = 108;
let gainRatioLeft = 0.5;
let gainRatioRight = 0.5;

function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  updateAudioBtn();
}

function initAudio() {
  ensureAudio();
  store.setState({
    status: "Audio geactiveerd. Systeemvolume is optioneel. Start kalibratie.",
  });
  document.getElementById("btnCalibrate").disabled = false;
}

function updateAudioBtn() {
  const btn = document.getElementById("btnInit");
  if (!btn) return;
  if (!audioCtx || audioCtx.state === "closed") {
    btn.className = "error";
    btn.textContent = "Audio ✗";
  } else if (audioCtx.state === "running") {
    btn.className = "ready";
    btn.textContent = "Audio ✓";
  } else {
    btn.className = "pending";
    btn.textContent = "Audio ⏳";
  }
}

function updateCalibrateBtn() {
  const btn = document.getElementById("btnCalibrate");
  if (!btn) return;
  const state = store.getState();
  const leftDone = state.calibrationGainLeft !== 0.001;
  const rightDone = state.calibrationGainRight !== 0.001;
  if (leftDone && rightDone) {
    btn.className = "ready";
    btn.textContent = "Kalibratie ✓";
  } else if (leftDone || rightDone) {
    btn.className = "pending";
    btn.textContent = "Kalibratie ⏳";
  } else {
    btn.className = "error";
    btn.textContent = "Kalibratie ✗";
  }
}

initAudio();

function startOsc(freq, gain) {
  ensureAudio();
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
    try {
      osc.stop();
    } catch (e) {}
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
  const state = store.getState();
  const ratio = currentGain / calGain(state);
  if (state.ear === "left") gainRatioLeft = ratio;
  else gainRatioRight = ratio;
}

/* ---------------------------------------------------------
   PIANO NOTE NAVIGATION
--------------------------------------------------------- */
function calGain(state) {
  return state.ear === "left"
    ? state.calibrationGainLeft
    : state.calibrationGainRight;
}

function playCurrentNote() {
  const freq = pianoNotes[currentNoteIndex];
  const state = store.getState();
  const ratio = state.ear === "left" ? gainRatioLeft : gainRatioRight;
  const gain = calGain(state) * ratio;
  stopOsc();
  startOsc(freq, gain);
  const midi = currentNoteIndex + midiLower;
  store.setState({
    currentX: xFromFreq(freq),
    currentGain: gain,
    info: `Test freq ≈ ${freq.toFixed(0)} Hz (${state.ear}) [MIDI ${midi}/${midiLower + pianoNotes.length - 1}]`,
  });
}

function nextNote() {
  if (currentNoteIndex < pianoNotes.length - 1) {
    currentNoteIndex++;
    playCurrentNote();
  }
}

function prevNote() {
  if (currentNoteIndex > 0) {
    currentNoteIndex--;
    playCurrentNote();
  }
}

/* ---------------------------------------------------------
   TESTFLOW
--------------------------------------------------------- */
function startCalibration() {
  const ear = store.getState().ear;
  store.setState({ mode: "calibrate" });
  startOsc(1000, 0.0001);
  store.setState({
    status: `Kalibratie (${ear}): ↑/↓ volume, E=wissel oor, spatie = bevestigen.`,
  });
}

function finishCalibration() {
  const state = store.getState();
  const key =
    state.ear === "left" ? "calibrationGainLeft" : "calibrationGainRight";
  store.setState({
    [key]: state.currentGain,
    mode: "idle",
    status: `${state.ear === "left" ? "Linker" : "Rechter"} oor gekalibreerd. Start nu de testfase.`,
  });
  updateCalibrateBtn();
  stopOsc();
  const s = store.getState();
  if (s.calibrationGainLeft !== 0.001 && s.calibrationGainRight !== 0.001) {
    document.getElementById("btnTest").disabled = false;
  }
}

function startTest() {
  const gen = freqGen(pianoFreqs, midiHigher, midiLower);
  pianoNotes = [...skipN(gen, 4)];
  currentNoteIndex = 0;
  store.setState({ mode: "test" });
  playCurrentNote();
}

function markThreshold() {
  const state = store.getState();
  const freq = pianoNotes[currentNoteIndex];
  const point = { x: state.currentX, freq, gain: state.currentGain };

  if (state.ear === "left") {
    const thresholdsLeft = [...state.thresholdsLeft, point].sort(
      (a, b) => a.freq - b.freq,
    );
    store.setState({ thresholdsLeft, ear: "right" });
    playCurrentNote();
  } else {
    const thresholdsRight = [...state.thresholdsRight, point].sort(
      (a, b) => a.freq - b.freq,
    );
    store.setState({ thresholdsRight });

    if (currentNoteIndex < pianoNotes.length - 1) {
      currentNoteIndex++;
      store.setState({ ear: "left" });
      playCurrentNote();
    } else {
      stopOsc();
      store.setState({ status: "Beide oren getest. Start nu de sweep." });
      document.getElementById("btnSweep").disabled = false;
      document.getElementById("btnSweep").className = "ready";
      document.getElementById("btnDownload").disabled = false;
    }
  }
}

/* ---------------------------------------------------------
   SWEEP
--------------------------------------------------------- */
let sweepStopped = false;
let sweepRunning = false;

async function sweepEar(points, dur) {
  if (sweepStopped || points.length < 2) return;
  startOsc(points[0].freq, points[0].gain);
  const ear = store.getState().ear;
  store.setState({ currentX: xFromFreq(points[0].freq), currentGain: points[0].gain });
  for (let i = 1; i < points.length; i++) {
    if (sweepStopped) return;
    const from = points[i - 1];
    const to = points[i];
    store.setState({ info: `Sweep: ${from.freq.toFixed(0)} → ${to.freq.toFixed(0)} Hz (${ear})` });
    const now = audioCtx.currentTime;
    osc.frequency.linearRampToValueAtTime(to.freq, now + dur / 1000);
    gainNode.gain.linearRampToValueAtTime(to.gain, now + dur / 1000);
    const steps = 15;
    for (let s = 1; s <= steps; s++) {
      if (sweepStopped) return;
      const t = s / steps;
      store.setState({ currentX: xFromFreq(from.freq + (to.freq - from.freq) * t), currentGain: from.gain + (to.gain - from.gain) * t });
      await new Promise(r => setTimeout(r, dur / steps));
    }
  }
}

async function startSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  sweepStopped = false;
  stopOsc();
  ensureAudio();
  const state = store.getState();
  const leftPts = [...state.thresholdsLeft].sort((a, b) => a.freq - b.freq);
  const rightPts = [...state.thresholdsRight].sort((a, b) => a.freq - b.freq);
  if (leftPts.length < 2 && rightPts.length < 2) {
    store.setState({ status: "Niet genoeg drempels voor sweep (minimaal 2 per oor nodig)." });
    sweepRunning = false;
    return;
  }
  store.setState({ mode: "sweep" });
  const btn = document.getElementById("btnSweep");
  btn.className = "error";
  btn.textContent = "Stop sweep";
  while (!sweepStopped) {
    if (leftPts.length >= 2) {
      store.setState({ ear: "left", status: "Sweep linkeroor..." });
      await sweepEar(leftPts, 1500);
    }
    if (sweepStopped) break;
    if (rightPts.length >= 2) {
      store.setState({ ear: "right", status: "Sweep rechteroor..." });
      await sweepEar(rightPts, 1500);
    }
  }
  stopOsc();
  btn.className = "ready";
  btn.textContent = "Sweep";
  store.setState({ mode: "idle", status: sweepStopped ? "Sweep gestopt." : "Sweep klaar." });
  sweepRunning = false;
}

function stopSweep() {
  sweepStopped = true;
}

/* ---------------------------------------------------------
   DOWNLOAD / UPLOAD
--------------------------------------------------------- */
function loadResults(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const left = data.ears && data.ears.left;
      const right = data.ears && data.ears.right;
      if (!left || !right) throw new Error("Ongeldig bestand: 'ears.left' of 'ears.right' ontbreekt.");
      const patch = {
        systemVolume: data.systemVolume ?? 50,
        calibrationFreq: left.calibration?.frequency ?? 1000,
        calibrationGainLeft: left.calibration?.gain ?? 0.001,
        calibrationGainRight: right.calibration?.gain ?? 0.001,
        thresholdsLeft: left.thresholds ?? [],
        thresholdsRight: right.thresholds ?? [],
        mode: "idle",
        ear: "left",
        currentGain: 0.0001,
        currentX: 0.5,
        info: "",
        status: `Geladen: ${left.thresholds?.length ?? 0} linker / ${right.thresholds?.length ?? 0} rechter drempels`,
      };
      stopOsc();
      store.setState(patch);
      updateCalibrateBtn();
      if (left.thresholds?.length || right.thresholds?.length) {
        document.getElementById("btnSweep").disabled = false;
        document.getElementById("btnSweep").className = "ready";
        document.getElementById("btnDownload").disabled = false;
      }
    } catch (err) {
      store.setState({ status: "Fout bij laden: " + err.message });
    }
  };
  reader.readAsText(file);
}

function downloadResults() {
  const state = store.getState();
  const data = {
    timestamp: new Date().toISOString(),
    os: navigator.userAgent,
    systemVolume: state.systemVolume,
    ears: {
      left: {
        calibration: {
          frequency: state.calibrationFreq,
          gain: state.calibrationGainLeft,
        },
        thresholds: state.thresholdsLeft,
      },
      right: {
        calibration: {
          frequency: state.calibrationFreq,
          gain: state.calibrationGainRight,
        },
        thresholds: state.thresholdsRight,
      },
    },
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "hoortest_" + Date.now() + ".json";
  a.click();
  URL.revokeObjectURL(url);
}
