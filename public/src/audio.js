import { logFreqFromX, xFromFreq, pianoFreqs, freqGen, skipN } from "./freq-gens.js";
import { MODE, AUDIO, UPLOAD } from "./state-machine.js";

let audioCtx = null;
let osc = null;
let gainNode = null;
let panner = null;

let pianoNotes = [];
let currentNoteIndex = 0;
let gainRatioLeft = 0.5;
let gainRatioRight = 0.5;
let sweepStopped = false;
let sweepRunning = false;

let _store = null;
let _stateMachine = null;
let _midiLower = 55;
let _midiHigher = 108;
let _calibrationFreq = 1000;

export function configure({ store, stateMachine, midiLower, midiHigher, calibrationFreq }) {
  _store = store;
  _stateMachine = stateMachine;
  _midiLower = midiLower;
  _midiHigher = midiHigher;
  _calibrationFreq = calibrationFreq;
}

export function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  _store.setState({ audioReady: true, audioRunning: audioCtx.state === "running" });
  _stateMachine.transitionAudio(AUDIO.READY);
}

export function initAudio() {
  ensureAudio();
  _store.setState({ status: "Audio geactiveerd. Systeemvolume is optioneel. Start kalibratie." });
}

export function isAudioRunning() {
  ensureAudio();
  return audioCtx?.state === "running";
}

export function setPan(ear) {
  if (panner) panner.pan.value = ear === "left" ? -1 : 1;
}

export function startOsc(freq, gain) {
  ensureAudio();
  stopOsc();
  osc = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();
  const ear = _store.getState().ear;
  panner = new StereoPannerNode(audioCtx, { pan: ear === "left" ? -1 : 1 });
  osc.type = "sine";
  osc.frequency.value = freq;
  gainNode.gain.value = gain;
  osc.connect(panner).connect(gainNode).connect(audioCtx.destination);
  osc.start();
}

export function stopOsc() {
  if (osc) {
    try { osc.stop(); } catch (e) {}
    osc.disconnect();
    osc = null;
  }
}

export function setFreqFromX(x) {
  const currentX = Math.min(1, Math.max(0, x));
  const f = logFreqFromX(currentX);
  if (osc) osc.frequency.value = f;
  _store.setState({ currentX });
  return f;
}

export function setGain(g) {
  const currentGain = Math.max(0.0000001, g);
  if (gainNode) gainNode.gain.value = currentGain;
  _store.setState({ currentGain });
  const state = _store.getState();
  const cal = state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight;
  const ratio = currentGain / cal;
  if (state.ear === "left") gainRatioLeft = ratio;
  else gainRatioRight = ratio;
}

export function calGain(state) {
  return state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight;
}

export function playCurrentNote() {
  const freq = pianoNotes[currentNoteIndex];
  const state = _store.getState();
  const ratio = state.ear === "left" ? gainRatioLeft : gainRatioRight;
  const gain = calGain(state) * ratio;
  stopOsc();
  startOsc(freq, gain);
  const midi = currentNoteIndex + _midiLower;
  _store.setState({
    currentX: xFromFreq(freq),
    currentGain: gain,
    info: `Test freq ≈ ${freq.toFixed(0)} Hz (${state.ear}) [MIDI ${midi}/${_midiLower + pianoNotes.length - 1}]`,
  });
}

export function nextNote() {
  if (currentNoteIndex < pianoNotes.length - 1) {
    currentNoteIndex++;
    playCurrentNote();
  }
}

export function prevNote() {
  if (currentNoteIndex > 0) {
    currentNoteIndex--;
    playCurrentNote();
  }
}

export function startCalibration() {
  _stateMachine.transitionMode(MODE.CALIBRATING);
}

export function finishCalibration() {
  const state = _store.getState();
  const key = state.ear === "left" ? "calibrationGainLeft" : "calibrationGainRight";
  _store.setState({ [key]: state.currentGain });
  _stateMachine.transitionMode(MODE.IDLE, {
    status: `${state.ear === "left" ? "Linker" : "Rechter"} oor gekalibreerd.`,
  });
}

export function startTest() {
  const state = _store.getState();
  _store.setState({ ear: "left" });
  setPan("left");
  const gen = freqGen(pianoFreqs, state.midiUpper, state.midiLower);
  pianoNotes = [...skipN(gen, 4)];
  currentNoteIndex = 0;
  playCurrentNote();
}

function upsertPoint(list, point) {
  const idx = list.findIndex(p => p.freq === point.freq);
  const next = idx === -1 ? [...list, point] : [...list.slice(0, idx), point, ...list.slice(idx + 1)];
  return next.sort((a, b) => a.freq - b.freq);
}

export function markThreshold() {
  const state = _store.getState();
  const freq = pianoNotes[currentNoteIndex];
  const point = { x: state.currentX, freq, gain: state.currentGain };

  if (state.ear === "left") {
    _store.setState({ thresholdsLeft: upsertPoint(state.thresholdsLeft, point), ear: "right" });
    playCurrentNote();
  } else {
    _store.setState({ thresholdsRight: upsertPoint(state.thresholdsRight, point) });
    if (currentNoteIndex < pianoNotes.length - 1) {
      currentNoteIndex++;
      _store.setState({ ear: "left" });
      playCurrentNote();
    } else {
      stopOsc();
      _stateMachine.transitionMode(MODE.IDLE, {
        status: "Beide oren getest. Start nu de sweep.",
      });
    }
  }
}

export async function sweepEar(points, dur) {
  if (sweepStopped || points.length < 2) return;
  startOsc(points[0].freq, points[0].gain);
  const ear = _store.getState().ear;
  _store.setState({ currentX: xFromFreq(points[0].freq), currentGain: points[0].gain });
  for (let i = 1; i < points.length; i++) {
    if (sweepStopped) return;
    const from = points[i - 1];
    const to = points[i];
    _store.setState({ info: `Sweep: ${from.freq.toFixed(0)} → ${to.freq.toFixed(0)} Hz (${ear})` });
    const now = audioCtx.currentTime;
    osc.frequency.linearRampToValueAtTime(to.freq, now + dur / 1000);
    gainNode.gain.linearRampToValueAtTime(to.gain, now + dur / 1000);
    const steps = 15;
    for (let s = 1; s <= steps; s++) {
      if (sweepStopped) return;
      const t = s / steps;
      _store.setState({
        currentX: xFromFreq(from.freq + (to.freq - from.freq) * t),
        currentGain: from.gain + (to.gain - from.gain) * t,
      });
      await new Promise(r => setTimeout(r, dur / steps));
    }
  }
}

export async function startSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  sweepStopped = false;
  stopOsc();
  ensureAudio();
  const state = _store.getState();
  const leftPts = [...state.thresholdsLeft].sort((a, b) => a.freq - b.freq);
  const rightPts = [...state.thresholdsRight].sort((a, b) => a.freq - b.freq);
  while (!sweepStopped) {
    if (leftPts.length >= 2) {
      _store.setState({ ear: "left", status: "Sweep linkeroor..." });
      await sweepEar(leftPts, 1500);
    }
    if (sweepStopped) break;
    if (rightPts.length >= 2) {
      _store.setState({ ear: "right", status: "Sweep rechteroor..." });
      await sweepEar(rightPts, 1500);
    }
  }
  stopOsc();
  sweepRunning = false;
  _stateMachine.transitionMode(MODE.IDLE, {
    status: sweepStopped ? "Sweep gestopt." : "Sweep klaar.",
  });
}

export function stopSweep() {
  sweepStopped = true;
}

export function reset() {
  stopOsc();
  sweepStopped = false;
  sweepRunning = false;
  pianoNotes = [];
  currentNoteIndex = 0;
  gainRatioLeft = 0.5;
  gainRatioRight = 0.5;
}

export function loadResults(file) {
  if (_store.getState().mode !== MODE.IDLE) {
    _store.setState({ status: "Upload alleen mogelijk in rust-modus." });
    return;
  }
  _stateMachine.setUploadStatus(UPLOAD.BUSY);
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const left = data.ears && data.ears.left;
      const right = data.ears && data.ears.right;
      if (!left || !right) throw new Error("Ongeldig bestand: 'ears.left' of 'ears.right' ontbreekt.");
      const patch = {
        systemVolume: data.systemVolume ?? 50,
        calibrationFreq: left.calibration?.frequency ?? _calibrationFreq,
        calibrationGainLeft: left.calibration?.gain ?? 0.001,
        calibrationGainRight: right.calibration?.gain ?? 0.001,
        thresholdsLeft: left.thresholds ?? [],
        thresholdsRight: right.thresholds ?? [],
        freqLower: data.freqLower ?? 110,
        freqUpper: data.freqUpper ?? 7040,
        midiLower: data.midiLower ?? 45,
        midiUpper: data.midiUpper ?? 117,
        ear: "left",
        currentGain: 0.0001,
        currentX: 0.5,
        info: "",
        status: `Geladen: ${left.thresholds?.length ?? 0} linker / ${right.thresholds?.length ?? 0} rechter drempels`,
      };
      stopOsc();
      _store.setState(patch);
      _stateMachine.recalcPermissions();
      _stateMachine.setUploadStatus(UPLOAD.DONE);
    } catch (err) {
      _store.setState({ status: "Fout bij laden: " + err.message });
      _stateMachine.setUploadStatus(UPLOAD.ERROR);
    }
  };
  reader.readAsText(file);
}

export function downloadResults() {
  const state = _store.getState();
  const data = {
    timestamp: new Date().toISOString(),
    os: navigator.userAgent,
    systemVolume: state.systemVolume,
    freqLower: state.freqLower,
    freqUpper: state.freqUpper,
    midiLower: state.midiLower,
    midiUpper: state.midiUpper,
    ears: {
      left: {
        calibration: { frequency: state.calibrationFreq, gain: state.calibrationGainLeft },
        thresholds: state.thresholdsLeft,
      },
      right: {
        calibration: { frequency: state.calibrationFreq, gain: state.calibrationGainRight },
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
