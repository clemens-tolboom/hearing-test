import { createStore } from "./src/state.js";
import { configure as configureFreqGens, xFromFreq } from "./src/freq-gens.js";
import { createStateMachine, MODE, AUDIO, UPLOAD } from "./src/state-machine.js";
import * as Audio from "./src/audio.js";

/* ---------------------------------------------------------
   APP CONSTANTS
--------------------------------------------------------- */
const APP_VERSION = "0.1.0";
const CALIBRATION_FREQ = 1000;

const A_OCTAVES = [
  { label: "A0", midi: 21, freq: 27.5 },
  { label: "A1", midi: 33, freq: 55 },
  { label: "A2", midi: 45, freq: 110 },
  { label: "A3", midi: 57, freq: 220 },
  { label: "A4", midi: 69, freq: 440 },
  { label: "A5", midi: 81, freq: 880 },
  { label: "A6", midi: 93, freq: 1760 },
  { label: "A7", midi: 105, freq: 3520 },
  { label: "A8", midi: 117, freq: 7040 },
];

const DEFAULT_LOWER = A_OCTAVES[4];
const DEFAULT_UPPER = A_OCTAVES[8];

/* ---------------------------------------------------------
   CONFIGURE MODULES
--------------------------------------------------------- */
configureFreqGens({ fMin: DEFAULT_LOWER.freq, fMax: DEFAULT_UPPER.freq });

const store = createStore({
  mode: MODE.IDLE,
  audioStatus: AUDIO.INIT,
  uploadStatus: UPLOAD.IDLE,
  ear: "left",
  audioReady: false,
  audioRunning: false,
  calibrationGainLeft: 0.001,
  calibrationGainRight: 0.001,
  calibrationFreq: CALIBRATION_FREQ,
  currentGain: 0.0001,
  currentX: 0.5,
  systemVolume: 50,
  thresholdsLeft: [],
  thresholdsRight: [],
  status: "",
  info: "",
  freqLower: DEFAULT_LOWER.freq,
  freqUpper: DEFAULT_UPPER.freq,
  midiLower: DEFAULT_LOWER.midi,
  midiUpper: DEFAULT_UPPER.midi,
  canUpload: false,
  canCalibrate: false,
  canTest: false,
  canSweep: false,
});

const stateMachine = createStateMachine(store, {
  onEnterMode: {
    [MODE.IDLE]: () => {
      stateMachine.recalcPermissions();
      store.setState({ uploadStatus: UPLOAD.IDLE });
    },
    [MODE.CALIBRATING]: () => {
      const ear = store.getState().ear;
      Audio.startOsc(CALIBRATION_FREQ, 0.0001);
      store.setState({
        status: `Kalibratie (${ear}): ↑/↓ volume, E=wissel oor, spatie = bevestigen.`,
      });
    },
    [MODE.TESTING]: () => Audio.startTest(),
    [MODE.SWEEPING]: () => Audio.startSweep(),
  },
  onExitMode: {
    [MODE.CALIBRATING]: () => Audio.stopOsc(),
    [MODE.TESTING]: () => Audio.stopOsc(),
    [MODE.SWEEPING]: () => Audio.stopOsc(),
  },
  onEnterAudio: {
    [AUDIO.READY]: () => {
      store.setState({ canUpload: true, canCalibrate: true });
    },
    [AUDIO.ERROR]: () => {
      store.setState({ status: "Audio niet beschikbaar." });
    },
  },
});

Audio.configure({
  store,
  stateMachine,
  midiLower: DEFAULT_LOWER.midi,
  midiHigher: DEFAULT_UPPER.midi,
  calibrationFreq: CALIBRATION_FREQ,
});

/* ---------------------------------------------------------
   DOM REFERENCES
--------------------------------------------------------- */
const statusEl = document.getElementById("status");
const infoEl = document.getElementById("info");
const canvas = document.getElementById("chart");
const ctx2d = canvas.getContext("2d");
const btnInit = document.getElementById("btnInit");
const inputVolume = document.getElementById("inputVolume");
const btnCalibrate = document.getElementById("btnCalibrate");
const btnTest = document.getElementById("btnTest");
const btnSweep = document.getElementById("btnSweep");
const btnDownload = document.getElementById("btnDownload");
const btnUpload = document.getElementById("btnUpload");
const btnReset = document.getElementById("btnReset");
const fileInput = document.getElementById("fileInput");
const selLower = document.getElementById("freqLower");
const selUpper = document.getElementById("freqUpper");

let _cachedLower = DEFAULT_LOWER.freq;
let _cachedUpper = DEFAULT_UPPER.freq;

document.getElementById("version").textContent = "v" + APP_VERSION;

/* ---------------------------------------------------------
   POPULATE DROPDOWNS
--------------------------------------------------------- */
A_OCTAVES.forEach((oct, i) => {
  selLower.appendChild(new Option(oct.label, i));
  selUpper.appendChild(new Option(oct.label, i));
});
selLower.selectedIndex = 2;
selUpper.selectedIndex = 8;

function applyBounds(loFreq, hiFreq, loMidi, hiMidi) {
  _cachedLower = loFreq;
  _cachedUpper = hiFreq;
  configureFreqGens({ fMin: loFreq, fMax: hiFreq });
  Audio.configure({
    store,
    stateMachine,
    midiLower: loMidi,
    midiHigher: hiMidi,
    calibrationFreq: CALIBRATION_FREQ,
  });
}

/* ---------------------------------------------------------
   CHART
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
    return Math.max(chartTop, Math.min(chartBottom, chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight));
  }

  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, w, h);

  ctx2d.strokeStyle = "#333";
  ctx2d.fillStyle = "#777";
  ctx2d.font = "11px system-ui";
  Array.from({ length: (dBMax - dBMin) / 20 + 1 }, (_, i) => dBMin + i * 20).forEach((dB) => {
    const y = chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight;
    ctx2d.beginPath();
    ctx2d.moveTo(40, y);
    ctx2d.lineTo(w - 10, y);
    ctx2d.stroke();
    ctx2d.fillText(dB + " dB", 3, y + 4);
  });

  ctx2d.strokeStyle = "#444";
  ctx2d.beginPath();
  ctx2d.moveTo(40, chartTop);
  ctx2d.lineTo(40, chartBottom);
  ctx2d.lineTo(w - 10, chartBottom);
  ctx2d.stroke();

  ctx2d.fillStyle = "#555";
  ctx2d.font = "12px system-ui";
  const firstOct = Math.ceil(Math.log2(state.freqLower / 125));
  const lastOct = Math.floor(Math.log2(state.freqUpper / 125));
  for (let n = firstOct; n <= lastOct; n++) {
    const f = 125 * Math.pow(2, n);
    const x = 40 + xFromFreq(f) * (w - 60);
    const label = f >= 1000 ? (f / 1000).toFixed(0) + "k" : Math.round(f).toString();
    ctx2d.fillRect(x, chartBottom, 1, 5);
    ctx2d.fillText(label, x - 10, chartBottom + 14);
  }

  function drawList(list, color, calGain) {
    ctx2d.fillStyle = color;
    list.forEach((t) => {
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

  const xCur = 40 + state.currentX * (w - 60);
  const dB = 20 * Math.log10(state.currentGain / (state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight) + 1e-10);
  const yCur = dBtoY(dB);
  ctx2d.fillStyle = "#58a";
  ctx2d.beginPath();
  ctx2d.arc(xCur, yCur, 4, 0, Math.PI * 2);
  ctx2d.fill();
}

/* ---------------------------------------------------------
   HELPERS
--------------------------------------------------------- */
function setBtn(el, text, cls, disabled) {
  el.textContent = text;
  el.className = cls;
  el.disabled = disabled;
}

/* ---------------------------------------------------------
   STORE SUBSCRIBER — all UI derived from state
--------------------------------------------------------- */
function renderUI(state) {
  drawChart(state);
  statusEl.textContent = state.status;
  infoEl.textContent = state.info;

  const mode = state.mode;
  const leftDone = state.calibrationGainLeft !== 0.001;
  const rightDone = state.calibrationGainRight !== 0.001;
  const hasData = state.thresholdsLeft.length + state.thresholdsRight.length > 0;

  /* ---- Audio init ---- */
  const audioClass = state.audioStatus === AUDIO.READY ? "ready" : state.audioStatus === AUDIO.INIT ? "pending" : "error";
  const audioText = state.audioStatus === AUDIO.READY ? "Audio ✓" : state.audioStatus === AUDIO.INIT ? "Audio ⏳" : "Audio ✗";
  setBtn(btnInit, audioText, audioClass, false);

  /* ---- Calibrate ---- */
  const calClass = leftDone && rightDone ? "ready" : leftDone || rightDone ? "pending" : "error";
  const calText = leftDone && rightDone ? "Kalibratie ✓" : leftDone || rightDone ? "Kalibratie ⏳" : "Kalibratie ✗";
  setBtn(btnCalibrate, calText, calClass, mode !== MODE.IDLE || !state.canCalibrate);

  /* ---- Test ---- */
  if (mode === MODE.IDLE) {
    setBtn(btnTest, "Start test", state.canTest ? "ready" : "error", !state.canTest);
  } else if (mode === MODE.TESTING) {
    setBtn(btnTest, "Stop test", "error", false);
  } else {
    setBtn(btnTest, "Start test", "", true);
  }

  /* ---- Sweep ---- */
  if (mode === MODE.SWEEPING) {
    setBtn(btnSweep, "Stop sweep", "error", false);
  } else {
    setBtn(btnSweep, "Sweep", state.canSweep ? "ready" : "", !state.canSweep);
  }

  /* ---- Upload ---- */
  const upBusy = state.uploadStatus === UPLOAD.BUSY;
  const upErr = state.uploadStatus === UPLOAD.ERROR;
  const upDone = state.uploadStatus === UPLOAD.DONE;
  setBtn(btnUpload,
    upBusy ? "Bezig..." : upErr ? "Upload ✗" : upDone ? "Upload ✓" : "Upload resultaten",
    upBusy ? "pending" : upErr ? "error" : upDone ? "ready" : "",
    !state.canUpload || upBusy || mode !== MODE.IDLE);

  /* ---- Download ---- */
  setBtn(btnDownload, "Download resultaten", "", !hasData);

  /* ---- Reset ---- */
  const isBusy = mode === MODE.CALIBRATING || mode === MODE.TESTING || mode === MODE.SWEEPING;
  setBtn(btnReset, isBusy ? "Stop" : "Reset", "", false);

  /* ---- Dropdowns ---- */
  selLower.disabled = mode !== MODE.IDLE;
  selUpper.disabled = mode !== MODE.IDLE;

  /* ---- Sync dropdown indices on load/upload ---- */
  if (state.freqLower !== _cachedLower || state.freqUpper !== _cachedUpper) {
    selLower.selectedIndex = A_OCTAVES.findIndex((o) => o.freq === state.freqLower);
    selUpper.selectedIndex = A_OCTAVES.findIndex((o) => o.freq === state.freqUpper);
    applyBounds(state.freqLower, state.freqUpper, state.midiLower, state.midiUpper);
  }
}

store.subscribe(renderUI);
renderUI(store.getState());

/* ---------------------------------------------------------
   BUTTON HANDLERS
--------------------------------------------------------- */
inputVolume.oninput = () => {
  const v = parseInt(inputVolume.value, 10);
  if (!isNaN(v) && v >= 0 && v <= 100) {
    store.setState({ systemVolume: v });
  }
};

btnCalibrate.onclick = () => stateMachine.transitionMode(MODE.CALIBRATING);

btnTest.onclick = () => {
  if (store.getState().mode === MODE.TESTING) {
    stateMachine.transitionMode(MODE.IDLE, { status: "Test gestopt." });
  } else {
    stateMachine.transitionMode(MODE.TESTING);
  }
};

btnSweep.onclick = () => {
  if (store.getState().mode === MODE.SWEEPING) {
    Audio.stopSweep();
  } else {
    stateMachine.transitionMode(MODE.SWEEPING);
  }
};

btnReset.onclick = () => {
  Audio.reset();
  store.setState({
    calibrationGainLeft: 0.001,
    calibrationGainRight: 0.001,
    thresholdsLeft: [],
    thresholdsRight: [],
    currentGain: 0.0001,
    currentX: 0.5,
    ear: "left",
    info: "",
  });
  stateMachine.transitionMode(MODE.IDLE, { status: "Reset." });
};
btnDownload.onclick = () => Audio.downloadResults();
btnUpload.onclick = () => fileInput.click();
fileInput.onchange = () => {
  if (fileInput.files[0]) Audio.loadResults(fileInput.files[0]);
};

/* ---------------------------------------------------------
   FREQ BOUNDS DROPDOWNS
--------------------------------------------------------- */
function onBoundChange() {
  const lo = A_OCTAVES[parseInt(selLower.value)];
  const hi = A_OCTAVES[parseInt(selUpper.value)];
  if (lo.midi >= hi.midi) {
    store.setState({ status: "Ondergrens moet lager zijn dan bovengrens." });
    return;
  }
  store.setState({
    freqLower: lo.freq,
    freqUpper: hi.freq,
    midiLower: lo.midi,
    midiUpper: hi.midi,
  });
  applyBounds(lo.freq, hi.freq, lo.midi, hi.midi);
}

selLower.addEventListener("change", onBoundChange);
selUpper.addEventListener("change", onBoundChange);

/* ---------------------------------------------------------
   DRAG & DROP — upload
--------------------------------------------------------- */
const dropPanel = document.querySelector(".panel:nth-of-type(2)");
dropPanel.addEventListener("dragover", (e) => e.preventDefault());
dropPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".json")) Audio.loadResults(file);
});

/* ---------------------------------------------------------
   MOUSE WHEEL — volume
--------------------------------------------------------- */
canvas.addEventListener("wheel", (e) => {
  if (!Audio.isAudioRunning()) return;
  e.preventDefault();
  const state = store.getState();
  if (e.deltaY < 0) Audio.setGain(state.currentGain * 1.1);
  else Audio.setGain(state.currentGain / 1.1);
});

/* ---------------------------------------------------------
   KEYBOARD
--------------------------------------------------------- */
window.addEventListener("keydown", (e) => {
  if (!Audio.isAudioRunning()) return;
  const state = store.getState();

  if (e.key === "e" || e.key === "E") {
    const ear = state.ear === "left" ? "right" : "left";
    store.setState({ ear });
    Audio.setPan(ear);
    if (state.mode === MODE.TESTING) {
      Audio.playCurrentNote();
    } else if (state.mode === MODE.CALIBRATING) {
      store.setState({
        status: `Kalibratie (${ear}): ↑/↓ volume, E=wissel oor, spatie = bevestigen.`,
      });
    }
    return;
  }

  if (state.mode === MODE.CALIBRATING) {
    if (e.key === "ArrowUp") Audio.setGain(state.currentGain * 1.1);
    if (e.key === "ArrowDown") Audio.setGain(state.currentGain / 1.1);
    if (e.key === " ") { e.preventDefault(); Audio.finishCalibration(); }
  }

  if (state.mode === MODE.TESTING) {
    if (e.key === "ArrowRight") Audio.nextNote();
    if (e.key === "ArrowLeft") Audio.prevNote();
    if (e.key === " ") { e.preventDefault(); Audio.markThreshold(); }
  }
});

/* ---------------------------------------------------------
   BOOT
--------------------------------------------------------- */
Audio.initAudio();
