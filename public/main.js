import { createStore } from "./src/state.js";
import { configure as configureFreqGens, xFromFreq } from "./src/freq-gens.js";
import * as Audio from "./src/audio.js";

/* ---------------------------------------------------------
   APP CONSTANTS
--------------------------------------------------------- */
const APP_VERSION = "0.1.0";
const F_MIN = 110;
const F_MAX = 4186;
const CALIBRATION_FREQ = 1000;
const MIDI_LOWER = 55;
const MIDI_HIGHER = 108;

/* ---------------------------------------------------------
   CONFIGURE MODULES
--------------------------------------------------------- */
configureFreqGens({ fMin: F_MIN, fMax: F_MAX });

const store = createStore({
  mode: "idle",
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
});

Audio.configure({
  store,
  midiLower: MIDI_LOWER,
  midiHigher: MIDI_HIGHER,
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
const fileInput = document.getElementById("fileInput");

document.getElementById("version").textContent = "v" + APP_VERSION;

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
    return Math.max(
      chartTop,
      Math.min(
        chartBottom,
        chartBottom - ((dB - dBMin) / (dBMax - dBMin)) * chartHeight,
      ),
    );
  }

  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, w, h);

  ctx2d.strokeStyle = "#333";
  ctx2d.fillStyle = "#777";
  ctx2d.font = "11px system-ui";
  Array.from(
    { length: (dBMax - dBMin) / 20 + 1 },
    (_, i) => dBMin + i * 20,
  ).forEach((dB) => {
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
  Array.from({ length: 6 }, (_, i) => 125 * Math.pow(2, i)).forEach((f) => {
    const x = 40 + xFromFreq(f) * (w - 60);
    ctx2d.fillRect(x, chartBottom, 1, 5);
    ctx2d.fillText(f.toString(), x - 10, chartBottom + 14);
  });

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
  const dB =
    20 *
    Math.log10(
      state.currentGain /
        (state.ear === "left"
          ? state.calibrationGainLeft
          : state.calibrationGainRight) +
        1e-10,
    );
  const yCur = dBtoY(dB);
  ctx2d.fillStyle = "#58a";
  ctx2d.beginPath();
  ctx2d.arc(xCur, yCur, 4, 0, Math.PI * 2);
  ctx2d.fill();
}

/* ---------------------------------------------------------
   STORE SUBSCRIBER — all UI derived from state
--------------------------------------------------------- */
function renderUI(state) {
  drawChart(state);
  statusEl.textContent = state.status;
  infoEl.textContent = state.info;

  const leftDone = state.calibrationGainLeft !== 0.001;
  const rightDone = state.calibrationGainRight !== 0.001;
  const hasData =
    state.thresholdsLeft.length + state.thresholdsRight.length > 0;

  if (state.audioRunning) {
    btnInit.className = "ready";
    btnInit.textContent = "Audio ✓";
  } else if (state.audioReady) {
    btnInit.className = "pending";
    btnInit.textContent = "Audio ⏳";
  } else {
    btnInit.className = "error";
    btnInit.textContent = "Audio ✗";
  }

  btnCalibrate.disabled = state.mode !== "idle" || !state.audioReady;
  if (leftDone && rightDone) {
    btnCalibrate.className = "ready";
    btnCalibrate.textContent = "Kalibratie ✓";
  } else if (leftDone || rightDone) {
    btnCalibrate.className = "pending";
    btnCalibrate.textContent = "Kalibratie ⏳";
  } else {
    btnCalibrate.className = "error";
    btnCalibrate.textContent = "Kalibratie ✗";
  }

  btnTest.disabled = state.mode !== "idle" || !leftDone || !rightDone;

  if (state.mode === "sweep") {
    btnSweep.className = "error";
    btnSweep.textContent = "Stop sweep";
    btnSweep.disabled = false;
  } else {
    btnSweep.className = hasData ? "ready" : "";
    btnSweep.textContent = "Sweep";
    btnSweep.disabled = !hasData;
  }

  btnDownload.disabled = !hasData;
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

btnCalibrate.onclick = () => Audio.startCalibration();
btnTest.onclick = () => Audio.startTest();
btnSweep.onclick = () => {
  if (store.getState().mode === "sweep") Audio.stopSweep();
  else Audio.startSweep();
};
btnDownload.onclick = () => Audio.downloadResults();
btnUpload.onclick = () => fileInput.click();
fileInput.onchange = () => {
  if (fileInput.files[0]) Audio.loadResults(fileInput.files[0]);
};

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
    if (state.mode === "test") {
      Audio.playCurrentNote();
    } else if (state.mode === "calibrate") {
      store.setState({
        status: `Kalibratie (${ear}): ↑/↓ volume, E=wissel oor, spatie = bevestigen.`,
      });
    }
    return;
  }

  if (state.mode === "calibrate") {
    if (e.key === "ArrowUp") Audio.setGain(state.currentGain * 1.1);
    if (e.key === "ArrowDown") Audio.setGain(state.currentGain / 1.1);
    if (e.key === " ") Audio.finishCalibration();
  }

  if (state.mode === "test") {
    if (e.key === "ArrowRight") Audio.nextNote();
    if (e.key === "ArrowLeft") Audio.prevNote();
    if (e.key === " ") Audio.markThreshold();
  }
});

/* ---------------------------------------------------------
   BOOT
--------------------------------------------------------- */
Audio.initAudio();
