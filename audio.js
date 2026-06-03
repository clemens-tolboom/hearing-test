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
      document.getElementById("btnDownload").disabled = false;
    }
  }
}

/* ---------------------------------------------------------
   SWEEP
--------------------------------------------------------- */
async function playOnce(freq, gain, ms) {
  return new Promise((resolve) => {
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
  const all = [...state.thresholdsLeft, ...state.thresholdsRight].sort(
    (a, b) => a.freq - b.freq,
  );

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
