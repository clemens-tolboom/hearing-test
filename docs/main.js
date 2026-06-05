// public/src/state.js
function createStore(initialState) {
  const _state = {
    ...initialState
  };
  const _listeners = /* @__PURE__ */ new Set();
  return {
    getState() {
      return _state;
    },
    setState(partial, event) {
      const prev = {
        ..._state
      };
      Object.assign(_state, partial);
      for (const key of Object.keys(partial)) {
        console.log(`[store] ${event || key}  ${prev[key]} \u2192 ${_state[key]}`);
      }
      _listeners.forEach((fn) => fn(_state));
    },
    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    }
  };
}

// public/src/freq-gens.js
var _fMin = 110;
var _fMax = 4186;
function configure({ fMin, fMax }) {
  _fMin = fMin;
  _fMax = fMax;
}
function xFromFreq(freq) {
  return Math.log(freq / _fMin) / Math.log(_fMax / _fMin);
}
function* pianoFreqs(upper = 108, lower = 33) {
  for (let n = lower; n <= upper; n++) {
    yield 440 * Math.pow(2, (n - 69) / 12);
  }
}
function freqGen(genFn, ...args) {
  return {
    genFn,
    args,
    *[Symbol.iterator]() {
      yield* genFn(...args);
    },
    child(...newArgs) {
      return freqGen(genFn, ...newArgs);
    },
    reset() {
      return freqGen(genFn, ...args);
    }
  };
}
function* skipN(gen, n) {
  const it = gen[Symbol.iterator]();
  for (let i = 0; i < n; i++) it.next();
  yield* it;
}

// public/src/state-machine.js
var MODE = Object.freeze({
  IDLE: "idle",
  CALIBRATING: "calibrating",
  TESTING: "testing",
  SWEEPING: "sweeping"
});
var AUDIO = Object.freeze({
  INIT: "init",
  READY: "ready",
  ERROR: "error"
});
var UPLOAD = Object.freeze({
  IDLE: "idle",
  BUSY: "busy",
  DONE: "done",
  ERROR: "error"
});
var MODE_TRANSITIONS = {
  [MODE.IDLE]: [
    MODE.CALIBRATING,
    MODE.TESTING,
    MODE.SWEEPING
  ],
  [MODE.CALIBRATING]: [
    MODE.IDLE
  ],
  [MODE.TESTING]: [
    MODE.IDLE
  ],
  [MODE.SWEEPING]: [
    MODE.IDLE
  ]
};
var AUDIO_TRANSITIONS = {
  [AUDIO.INIT]: [
    AUDIO.READY,
    AUDIO.ERROR
  ],
  [AUDIO.READY]: [
    AUDIO.ERROR
  ],
  [AUDIO.ERROR]: []
};
function createStateMachine(store2, hooks = {}) {
  function transitionMode(newMode, extra) {
    const current = store2.getState().mode;
    if (current === newMode) return true;
    if (!MODE_TRANSITIONS[current]?.includes(newMode)) {
      console.warn(`[sm] Invalid mode transition: ${current} \u2192 ${newMode}`);
      return false;
    }
    hooks.onExitMode?.[current]?.();
    store2.setState({
      mode: newMode,
      ...extra
    }, `mode:${current}\u2192${newMode}`);
    hooks.onEnterMode?.[newMode]?.();
    return true;
  }
  function transitionAudio(newStatus) {
    const current = store2.getState().audioStatus;
    if (current === newStatus) return true;
    if (!AUDIO_TRANSITIONS[current]?.includes(newStatus)) {
      console.warn(`[sm] Invalid audio transition: ${current} \u2192 ${newStatus}`);
      return false;
    }
    store2.setState({
      audioStatus: newStatus
    }, `audio:${current}\u2192${newStatus}`);
    hooks.onEnterAudio?.[newStatus]?.();
    return true;
  }
  function setUploadStatus(status) {
    store2.setState({
      uploadStatus: status
    }, `upload:${status}`);
  }
  function recalcPermissions() {
    const s = store2.getState();
    const leftDone = s.calibrationGainLeft !== 1e-3;
    const rightDone = s.calibrationGainRight !== 1e-3;
    store2.setState({
      canTest: leftDone && rightDone,
      canSweep: s.thresholdsLeft.length >= 2 || s.thresholdsRight.length >= 2
    });
  }
  return {
    transitionMode,
    transitionAudio,
    setUploadStatus,
    recalcPermissions
  };
}

// public/src/audio.js
var audioCtx = null;
var osc = null;
var gainNode = null;
var panner = null;
var pianoNotes = [];
var currentNoteIndex = 0;
var gainRatioLeft = 0.5;
var gainRatioRight = 0.5;
var sweepStopped = false;
var sweepRunning = false;
var _store = null;
var _stateMachine = null;
var _midiLower = 55;
var _midiHigher = 108;
var _calibrationFreq = 1e3;
function configure2({ store: store2, stateMachine: stateMachine2, midiLower, midiHigher, calibrationFreq }) {
  _store = store2;
  _stateMachine = stateMachine2;
  _midiLower = midiLower;
  _midiHigher = midiHigher;
  _calibrationFreq = calibrationFreq;
}
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  _store.setState({
    audioReady: true,
    audioRunning: audioCtx.state === "running"
  });
  _stateMachine.transitionAudio(AUDIO.READY);
}
function initAudio() {
  ensureAudio();
  _store.setState({
    status: "Audio geactiveerd. Start kalibratie."
  });
}
function isAudioRunning() {
  ensureAudio();
  return audioCtx?.state === "running";
}
function setPan(ear) {
  if (panner) panner.pan.value = ear === "left" ? -1 : 1;
}
function startOsc(freq, gain) {
  ensureAudio();
  stopOsc();
  osc = audioCtx.createOscillator();
  gainNode = audioCtx.createGain();
  const ear = _store.getState().ear;
  panner = new StereoPannerNode(audioCtx, {
    pan: ear === "left" ? -1 : 1
  });
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
    } catch (e) {
    }
    osc.disconnect();
    osc = null;
  }
}
function setGain(g) {
  const currentGain = Math.max(1e-7, g);
  if (gainNode) gainNode.gain.value = currentGain;
  _store.setState({
    currentGain
  });
  const state = _store.getState();
  const cal = state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight;
  const ratio = currentGain / cal;
  if (state.ear === "left") gainRatioLeft = ratio;
  else gainRatioRight = ratio;
}
function calGain(state) {
  return state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight;
}
function playCurrentNote() {
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
    info: `Test freq \u2248 ${freq.toFixed(0)} Hz (${state.ear}) [MIDI ${midi}/${_midiLower + pianoNotes.length - 1}]`
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
function finishCalibration() {
  const state = _store.getState();
  const key = state.ear === "left" ? "calibrationGainLeft" : "calibrationGainRight";
  _store.setState({
    [key]: state.currentGain
  });
  if (state.ear === "left") {
    const rightGain = state.calibrationGainRight !== 1e-3 ? state.calibrationGainRight : 1e-4;
    setPan("right");
    if (gainNode) gainNode.gain.value = rightGain;
    _store.setState({
      ear: "right",
      currentGain: rightGain,
      status: "Linker oor gekalibreerd. Nu rechter oor. \u2191/\u2193 volume, spatie = bevestigen."
    });
  } else {
    stopOsc();
    _stateMachine.transitionMode(MODE.IDLE, {
      status: "Beide oren gekalibreerd."
    });
  }
}
function startTest() {
  const state = _store.getState();
  _store.setState({
    ear: "left"
  });
  setPan("left");
  const gen = freqGen(pianoFreqs, state.midiUpper, state.midiLower);
  pianoNotes = [
    ...skipN(gen, 4)
  ];
  currentNoteIndex = 0;
  playCurrentNote();
}
function upsertPoint(list, point) {
  const idx = list.findIndex((p) => p.freq === point.freq);
  const next = idx === -1 ? [
    ...list,
    point
  ] : [
    ...list.slice(0, idx),
    point,
    ...list.slice(idx + 1)
  ];
  return next.sort((a, b) => a.freq - b.freq);
}
function markThreshold() {
  const state = _store.getState();
  const freq = pianoNotes[currentNoteIndex];
  const point = {
    x: state.currentX,
    freq,
    gain: state.currentGain
  };
  if (state.ear === "left") {
    _store.setState({
      thresholdsLeft: upsertPoint(state.thresholdsLeft, point),
      ear: "right"
    });
    playCurrentNote();
  } else {
    _store.setState({
      thresholdsRight: upsertPoint(state.thresholdsRight, point)
    });
    if (currentNoteIndex < pianoNotes.length - 1) {
      currentNoteIndex++;
      _store.setState({
        ear: "left"
      });
      playCurrentNote();
    } else {
      stopOsc();
      _stateMachine.transitionMode(MODE.IDLE, {
        status: "Beide oren getest. Start nu de sweep."
      });
    }
  }
}
async function sweepEar(points, dur) {
  if (sweepStopped || points.length < 2) return;
  startOsc(points[0].freq, points[0].gain);
  const ear = _store.getState().ear;
  _store.setState({
    currentX: xFromFreq(points[0].freq),
    currentGain: points[0].gain
  });
  for (let i = 1; i < points.length; i++) {
    if (sweepStopped) return;
    const from = points[i - 1];
    const to = points[i];
    _store.setState({
      info: `Sweep: ${from.freq.toFixed(0)} \u2192 ${to.freq.toFixed(0)} Hz (${ear})`
    });
    const now = audioCtx.currentTime;
    osc.frequency.linearRampToValueAtTime(to.freq, now + dur / 1e3);
    gainNode.gain.linearRampToValueAtTime(to.gain, now + dur / 1e3);
    const steps = 15;
    for (let s = 1; s <= steps; s++) {
      if (sweepStopped) return;
      const t = s / steps;
      _store.setState({
        currentX: xFromFreq(from.freq + (to.freq - from.freq) * t),
        currentGain: from.gain + (to.gain - from.gain) * t
      });
      await new Promise((r) => setTimeout(r, dur / steps));
    }
  }
}
async function startSweep() {
  if (sweepRunning) return;
  sweepRunning = true;
  sweepStopped = false;
  stopOsc();
  ensureAudio();
  const state = _store.getState();
  const leftPts = [
    ...state.thresholdsLeft
  ].sort((a, b) => a.freq - b.freq);
  const rightPts = [
    ...state.thresholdsRight
  ].sort((a, b) => a.freq - b.freq);
  while (!sweepStopped) {
    if (leftPts.length >= 2) {
      _store.setState({
        ear: "left",
        status: "Sweep linkeroor..."
      });
      await sweepEar(leftPts, 1500);
    }
    if (sweepStopped) break;
    if (rightPts.length >= 2) {
      _store.setState({
        ear: "right",
        status: "Sweep rechteroor..."
      });
      await sweepEar(rightPts, 1500);
    }
  }
  stopOsc();
  sweepRunning = false;
  _stateMachine.transitionMode(MODE.IDLE, {
    status: sweepStopped ? "Sweep gestopt." : "Sweep klaar."
  });
}
function stopSweep() {
  sweepStopped = true;
}
function reset() {
  stopOsc();
  sweepStopped = false;
  sweepRunning = false;
  pianoNotes = [];
  currentNoteIndex = 0;
  gainRatioLeft = 0.5;
  gainRatioRight = 0.5;
}
function loadResults(file) {
  if (_store.getState().mode !== MODE.IDLE) {
    _store.setState({
      status: "Upload alleen mogelijk in rust-modus."
    });
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
        calibrationFreq: left.calibration?.frequency ?? _calibrationFreq,
        calibrationGainLeft: left.calibration?.gain ?? 1e-3,
        calibrationGainRight: right.calibration?.gain ?? 1e-3,
        thresholdsLeft: left.thresholds ?? [],
        thresholdsRight: right.thresholds ?? [],
        freqLower: data.freqLower ?? 110,
        freqUpper: data.freqUpper ?? 7040,
        midiLower: data.midiLower ?? 45,
        midiUpper: data.midiUpper ?? 117,
        ear: "left",
        currentGain: 1e-4,
        currentX: 0.5,
        info: "",
        status: `Geladen: ${left.thresholds?.length ?? 0} linker / ${right.thresholds?.length ?? 0} rechter drempels`
      };
      stopOsc();
      _store.setState(patch);
      _stateMachine.recalcPermissions();
      _stateMachine.setUploadStatus(UPLOAD.DONE);
    } catch (err) {
      _store.setState({
        status: "Fout bij laden: " + err.message
      });
      _stateMachine.setUploadStatus(UPLOAD.ERROR);
    }
  };
  reader.readAsText(file);
}
function downloadResults() {
  const state = _store.getState();
  const data = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    os: navigator.userAgent,
    freqLower: state.freqLower,
    freqUpper: state.freqUpper,
    midiLower: state.midiLower,
    midiUpper: state.midiUpper,
    ears: {
      left: {
        calibration: {
          frequency: state.calibrationFreq,
          gain: state.calibrationGainLeft
        },
        thresholds: state.thresholdsLeft
      },
      right: {
        calibration: {
          frequency: state.calibrationFreq,
          gain: state.calibrationGainRight
        },
        thresholds: state.thresholdsRight
      }
    }
  };
  const blob = new Blob([
    JSON.stringify(data, null, 2)
  ], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "hoortest_" + Date.now() + ".json";
  a.click();
  URL.revokeObjectURL(url);
}

// public/main.js
var APP_VERSION = "0.2.5";
var CALIBRATION_FREQ = 1e3;
var A_OCTAVES = [
  { label: "A0", midi: 21, freq: 27.5 },
  { label: "A1", midi: 33, freq: 55 },
  { label: "A2", midi: 45, freq: 110 },
  { label: "A3", midi: 57, freq: 220 },
  { label: "A4", midi: 69, freq: 440 },
  { label: "A5", midi: 81, freq: 880 },
  { label: "A6", midi: 93, freq: 1760 },
  { label: "A7", midi: 105, freq: 3520 },
  { label: "A8", midi: 117, freq: 7040 }
];
var DEFAULT_LOWER = A_OCTAVES[4];
var DEFAULT_UPPER = A_OCTAVES[8];
configure({ fMin: DEFAULT_LOWER.freq, fMax: DEFAULT_UPPER.freq });
var store = createStore({
  mode: MODE.IDLE,
  audioStatus: AUDIO.INIT,
  uploadStatus: UPLOAD.IDLE,
  ear: "left",
  audioReady: false,
  audioRunning: false,
  calibrationGainLeft: 1e-3,
  calibrationGainRight: 1e-3,
  calibrationFreq: CALIBRATION_FREQ,
  currentGain: 1e-4,
  currentX: 0.5,
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
  canSweep: false
});
var stateMachine = createStateMachine(store, {
  onEnterMode: {
    [MODE.IDLE]: () => {
      stateMachine.recalcPermissions();
      store.setState({ uploadStatus: UPLOAD.IDLE });
    },
    [MODE.CALIBRATING]: () => {
      const state = store.getState();
      const gain = state.calibrationGainLeft !== 1e-3 ? state.calibrationGainLeft : 1e-4;
      store.setState({ ear: "left", currentGain: gain });
      startOsc(CALIBRATION_FREQ, gain);
      setPan("left");
      store.setState({
        status: "Kalibratie (links): \u2191/\u2193 volume, spatie = bevestigen."
      });
    },
    [MODE.TESTING]: () => startTest(),
    [MODE.SWEEPING]: () => startSweep()
  },
  onExitMode: {
    [MODE.CALIBRATING]: () => stopOsc(),
    [MODE.TESTING]: () => stopOsc(),
    [MODE.SWEEPING]: () => stopOsc()
  },
  onEnterAudio: {
    [AUDIO.READY]: () => {
      store.setState({ canUpload: true, canCalibrate: true });
    },
    [AUDIO.ERROR]: () => {
      store.setState({ status: "Audio niet beschikbaar." });
    }
  }
});
configure2({
  store,
  stateMachine,
  midiLower: DEFAULT_LOWER.midi,
  midiHigher: DEFAULT_UPPER.midi,
  calibrationFreq: CALIBRATION_FREQ
});
var statusEl = document.getElementById("status");
var infoEl = document.getElementById("info");
var canvas = document.getElementById("chart");
var ctx2d = canvas.getContext("2d");
var btnInit = document.getElementById("btnInit");
var btnCalibrate = document.getElementById("btnCalibrate");
var btnTest = document.getElementById("btnTest");
var btnSweep = document.getElementById("btnSweep");
var btnDownload = document.getElementById("btnDownload");
var btnUpload = document.getElementById("btnUpload");
var btnReset = document.getElementById("btnReset");
var fileInput = document.getElementById("fileInput");
var btnLeftEar = document.getElementById("btnLeftEar");
var btnRightEar = document.getElementById("btnRightEar");
var selLower = document.getElementById("freqLower");
var selUpper = document.getElementById("freqUpper");
var calControls = document.getElementById("calControls");
var testControls = document.getElementById("testControls");
var btnVolDown = document.getElementById("btnVolDown");
var btnVolUp = document.getElementById("btnVolUp");
var btnConfirm = document.getElementById("btnConfirm");
var btnPrevNote = document.getElementById("btnPrevNote");
var btnNextNote = document.getElementById("btnNextNote");
var btnMarkThreshold = document.getElementById("btnMarkThreshold");
var _cachedLower = DEFAULT_LOWER.freq;
var _cachedUpper = DEFAULT_UPPER.freq;
document.getElementById("version").textContent = "v" + APP_VERSION;
A_OCTAVES.forEach((oct, i) => {
  selLower.appendChild(new Option(oct.label, i));
  selUpper.appendChild(new Option(oct.label, i));
});
selLower.selectedIndex = 2;
selUpper.selectedIndex = 8;
function applyBounds(loFreq, hiFreq, loMidi, hiMidi) {
  _cachedLower = loFreq;
  _cachedUpper = hiFreq;
  configure({ fMin: loFreq, fMax: hiFreq });
  configure2({
    store,
    stateMachine,
    midiLower: loMidi,
    midiHigher: hiMidi,
    calibrationFreq: CALIBRATION_FREQ
  });
}
function resizeCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
}
function drawChart(state) {
  const dpr = window.devicePixelRatio || 1;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const s = w / 800;
  const chartTop = Math.max(8, Math.round(10 * s));
  const chartBottom = h - Math.max(16, Math.round(20 * s));
  const chartHeight = chartBottom - chartTop;
  const leftPad = Math.max(30, Math.round(40 * s));
  const rightPad = Math.max(8, Math.round(10 * s));
  const pf = w - leftPad - rightPad;
  const axisFontSize = Math.max(13, Math.round(11 * s));
  const freqFontSize = Math.max(13, Math.round(12 * s));
  const tickH = Math.max(4, Math.round(5 * s));
  const dotR = Math.max(3, Math.round(3 * s));
  const curDotR = Math.max(4, Math.round(4 * s));
  const dBMin = -60;
  function computeDB(gain, calGain2) {
    return 20 * Math.log10(gain / calGain2 + 1e-10);
  }
  const allDBs = [];
  state.thresholdsLeft.forEach((t) => allDBs.push(computeDB(t.gain, state.calibrationGainLeft)));
  state.thresholdsRight.forEach((t) => allDBs.push(computeDB(t.gain, state.calibrationGainRight)));
  allDBs.push(computeDB(state.currentGain, state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight));
  const rawMax = Math.max(...allDBs);
  const dBMax = Math.max(40, Math.ceil(rawMax / 20) * 20);
  function dBtoY(dB2) {
    return Math.max(chartTop, Math.min(chartBottom, chartBottom - (dB2 - dBMin) / (dBMax - dBMin) * chartHeight));
  }
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = "#000";
  ctx2d.fillRect(0, 0, w, h);
  ctx2d.strokeStyle = "#333";
  ctx2d.fillStyle = "#777";
  ctx2d.font = axisFontSize + "px system-ui";
  for (let dB2 = dBMin; dB2 <= dBMax; dB2 += 20) {
    const y = chartBottom - (dB2 - dBMin) / (dBMax - dBMin) * chartHeight;
    ctx2d.beginPath();
    ctx2d.moveTo(leftPad, y);
    ctx2d.lineTo(w - rightPad, y);
    ctx2d.stroke();
    ctx2d.fillText(dB2 + " dB", 3, y + Math.round(axisFontSize * 0.35));
  }
  ctx2d.strokeStyle = "#444";
  ctx2d.beginPath();
  ctx2d.moveTo(leftPad, chartTop);
  ctx2d.lineTo(leftPad, chartBottom);
  ctx2d.lineTo(w - rightPad, chartBottom);
  ctx2d.stroke();
  ctx2d.fillStyle = "#555";
  ctx2d.font = freqFontSize + "px system-ui";
  const firstOct = Math.ceil(Math.log2(state.freqLower / 125));
  const lastOct = Math.floor(Math.log2(state.freqUpper / 125));
  for (let n = firstOct; n <= lastOct; n++) {
    const f = 125 * Math.pow(2, n);
    const x = leftPad + xFromFreq(f) * pf;
    const label = f >= 1e3 ? (f / 1e3).toFixed(0) + "k" : Math.round(f).toString();
    ctx2d.fillRect(x, chartBottom, 1, tickH);
    ctx2d.fillText(label, x - Math.round(freqFontSize * 0.7), chartBottom + Math.round(freqFontSize * 1.1));
  }
  function drawList(list, color, calGain2) {
    ctx2d.fillStyle = color;
    list.forEach((t) => {
      const x = leftPad + t.x * pf;
      const dB2 = 20 * Math.log10(t.gain / calGain2 + 1e-10);
      const y = dBtoY(dB2);
      ctx2d.beginPath();
      ctx2d.arc(x, y, dotR, 0, Math.PI * 2);
      ctx2d.fill();
    });
  }
  drawList(state.thresholdsLeft, "#2a5", state.calibrationGainLeft);
  drawList(state.thresholdsRight, "#fa3", state.calibrationGainRight);
  const xCur = leftPad + state.currentX * pf;
  const dB = 20 * Math.log10(state.currentGain / (state.ear === "left" ? state.calibrationGainLeft : state.calibrationGainRight) + 1e-10);
  const yCur = dBtoY(dB);
  ctx2d.fillStyle = state.ear === "left" ? "#2a5" : "#fa3";
  ctx2d.beginPath();
  ctx2d.arc(xCur, yCur, curDotR, 0, Math.PI * 2);
  ctx2d.fill();
}
function setBtn(el, text, cls, disabled) {
  el.textContent = text;
  el.className = cls;
  el.disabled = disabled;
}
function switchEar(ear) {
  const state = store.getState();
  if (ear === state.ear) return;
  store.setState({ ear });
  setPan(ear);
  if (state.mode === MODE.TESTING) {
    playCurrentNote();
  } else if (state.mode === MODE.CALIBRATING) {
    store.setState({
      status: `Kalibratie (${ear}): \u2191/\u2193 volume, spatie = bevestigen.`
    });
  }
}
function renderUI(state) {
  drawChart(state);
  statusEl.textContent = state.status;
  infoEl.textContent = state.info;
  const mode = state.mode;
  const leftDone = state.calibrationGainLeft !== 1e-3;
  const rightDone = state.calibrationGainRight !== 1e-3;
  const hasData = state.thresholdsLeft.length + state.thresholdsRight.length > 0;
  const audioClass = state.audioStatus === AUDIO.READY ? "ready" : state.audioStatus === AUDIO.INIT ? "pending" : "error";
  const audioText = state.audioStatus === AUDIO.READY ? "Audio \u2713" : state.audioStatus === AUDIO.INIT ? "Audio \u23F3" : "Audio \u2717";
  setBtn(btnInit, audioText, audioClass, false);
  const calClass = leftDone && rightDone ? "ready" : leftDone || rightDone ? "pending" : "error";
  const calText = leftDone && rightDone ? "Kalibratie \u2713" : leftDone || rightDone ? "Kalibratie \u23F3" : "Kalibratie \u2717";
  setBtn(btnCalibrate, calText, calClass, mode !== MODE.IDLE || !state.canCalibrate);
  btnLeftEar.classList.toggle("active", state.ear === "left");
  btnRightEar.classList.toggle("active-right", state.ear === "right");
  calControls.style.display = mode === MODE.CALIBRATING ? "flex" : "none";
  testControls.style.display = mode === MODE.TESTING ? "flex" : "none";
  if (mode === MODE.IDLE) {
    setBtn(btnTest, "Start test", state.canTest ? "ready" : "error", !state.canTest);
  } else if (mode === MODE.TESTING) {
    setBtn(btnTest, "Stop test", "error", false);
  } else {
    setBtn(btnTest, "Start test", "", true);
  }
  if (mode === MODE.SWEEPING) {
    setBtn(btnSweep, "Stop sweep", "error", false);
  } else {
    setBtn(btnSweep, "Sweep", state.canSweep ? "ready" : "", !state.canSweep);
  }
  const upBusy = state.uploadStatus === UPLOAD.BUSY;
  const upErr = state.uploadStatus === UPLOAD.ERROR;
  const upDone = state.uploadStatus === UPLOAD.DONE;
  setBtn(
    btnUpload,
    upBusy ? "Bezig..." : upErr ? "Upload \u2717" : upDone ? "Upload \u2713" : "Upload resultaten",
    upBusy ? "pending" : upErr ? "error" : upDone ? "ready" : "",
    !state.canUpload || upBusy || mode !== MODE.IDLE
  );
  setBtn(btnDownload, "Download resultaten", "", !hasData);
  const isBusy = mode === MODE.CALIBRATING || mode === MODE.TESTING || mode === MODE.SWEEPING;
  setBtn(btnReset, isBusy ? "Stop" : "Reset", "", false);
  selLower.disabled = mode !== MODE.IDLE;
  selUpper.disabled = mode !== MODE.IDLE;
  if (state.freqLower !== _cachedLower || state.freqUpper !== _cachedUpper) {
    selLower.selectedIndex = A_OCTAVES.findIndex((o) => o.freq === state.freqLower);
    selUpper.selectedIndex = A_OCTAVES.findIndex((o) => o.freq === state.freqUpper);
    applyBounds(state.freqLower, state.freqUpper, state.midiLower, state.midiUpper);
  }
}
resizeCanvas();
store.subscribe(renderUI);
renderUI(store.getState());
new ResizeObserver(() => {
  resizeCanvas();
  renderUI(store.getState());
}).observe(canvas);
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
    stopSweep();
  } else {
    stateMachine.transitionMode(MODE.SWEEPING);
  }
};
btnReset.onclick = () => {
  reset();
  store.setState({
    calibrationGainLeft: 1e-3,
    calibrationGainRight: 1e-3,
    thresholdsLeft: [],
    thresholdsRight: [],
    currentGain: 1e-4,
    currentX: 0.5,
    ear: "left",
    info: ""
  });
  stateMachine.transitionMode(MODE.IDLE, { status: "Reset." });
};
btnLeftEar.onclick = () => switchEar("left");
btnRightEar.onclick = () => switchEar("right");
btnVolDown.onclick = () => {
  if (!isAudioRunning()) return;
  setGain(store.getState().currentGain / 1.1);
};
btnVolUp.onclick = () => {
  if (!isAudioRunning()) return;
  setGain(store.getState().currentGain * 1.1);
};
btnConfirm.onclick = () => {
  if (!isAudioRunning()) return;
  if (store.getState().mode === MODE.CALIBRATING) finishCalibration();
};
btnPrevNote.onclick = () => {
  if (!isAudioRunning()) return;
  prevNote();
};
btnNextNote.onclick = () => {
  if (!isAudioRunning()) return;
  nextNote();
};
btnMarkThreshold.onclick = () => {
  if (!isAudioRunning()) return;
  if (store.getState().mode === MODE.TESTING) markThreshold();
};
btnDownload.onclick = () => downloadResults();
btnUpload.onclick = () => fileInput.click();
fileInput.onchange = () => {
  if (fileInput.files[0]) loadResults(fileInput.files[0]);
};
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
    midiUpper: hi.midi
  });
  applyBounds(lo.freq, hi.freq, lo.midi, hi.midi);
}
selLower.addEventListener("change", onBoundChange);
selUpper.addEventListener("change", onBoundChange);
var dropPanel = document.querySelector(".panel:nth-of-type(2)");
dropPanel.addEventListener("dragover", (e) => e.preventDefault());
dropPanel.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith(".json")) loadResults(file);
});
canvas.addEventListener("wheel", (e) => {
  if (!isAudioRunning()) return;
  e.preventDefault();
  const state = store.getState();
  if (e.deltaY < 0) setGain(state.currentGain * 1.1);
  else setGain(state.currentGain / 1.1);
});
var _touchStartY = 0;
var _touchLastGain = 0;
canvas.addEventListener("touchstart", (e) => {
  if (!isAudioRunning()) return;
  _touchStartY = e.touches[0].clientY;
  _touchLastGain = store.getState().currentGain;
}, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (!isAudioRunning()) return;
  const deltaY = _touchStartY - e.touches[0].clientY;
  const factor = Math.pow(1.05, deltaY / 10);
  const g = Math.max(1e-7, _touchLastGain * factor);
  setGain(g);
}, { passive: true });
window.addEventListener("keydown", (e) => {
  if (!isAudioRunning()) return;
  const state = store.getState();
  if (e.key === "e" || e.key === "E") {
    const ear = state.ear === "left" ? "right" : "left";
    switchEar(ear);
    return;
  }
  if (state.mode === MODE.CALIBRATING) {
    if (e.key === "ArrowUp") setGain(state.currentGain * 1.1);
    if (e.key === "ArrowDown") setGain(state.currentGain / 1.1);
    if (e.key === " ") {
      e.preventDefault();
      finishCalibration();
    }
  }
  if (state.mode === MODE.TESTING) {
    if (e.key === "ArrowRight") nextNote();
    if (e.key === "ArrowLeft") prevNote();
    if (e.key === " ") {
      e.preventDefault();
      markThreshold();
    }
  }
});
initAudio();
