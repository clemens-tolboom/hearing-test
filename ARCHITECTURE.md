# HOORTEST Architecture

A browser-based Single Page Application for psychoacoustic hearing threshold measurements using piano frequencies with per-ear calibration and auto-ear-switching test flow.

---

## Overview

**Runtime**: Browser, vanilla JS, native ES modules (no build step)  
**Audio**: Web Audio API (OscillatorNode, GainNode, StereoPannerNode)  
**State**: Custom observable store (Flux-like pattern, factory-based)  
**UI**: Canvas 2D API + DOM text updates  
**Frequency range**: 110 Hz – 4186 Hz (piano A2–C8) logarithmic mapping  
**Hearing Test strategy**: Sequential piano notes with per-ear threshold marking, auto-advance to next frequency after both ears done  
**Output**: JSON download/upload (timestamp, OS, system volume, per-ear calibration + thresholds)  
**Input**: Keyboard (arrows, space, E), mouse wheel, buttons, number input  
**Version**: 0.1.0

---

## File Structure

```
index.html        — HTML shell, single <script type="module" src="main.js">
styles.css        — Dark theme, button state classes (.ready/.pending/.error)
main.js           — Entry point: constants, store creation, configure modules, all DOM/UI
state.js          — Observable store factory (ES module)
freq-gens.js      — Frequency generators (ES module)
audio.js          — Audio engine + application logic (ES module)
favicon.svg       — Tab icon
ARCHITECTURE.md   — This file
TODO.md           — Progress tracking
```

No `ui.js` — all UI rendering and event binding lives in `main.js`.

---

## Module Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         main.js (entry)                          │
│                                                                  │
│  Constants: APP_VERSION, F_MIN, F_MAX, CALIBRATION_FREQ, ...    │
│  Store created with full initial state (no defaults in modules)  │
│  Configure freq-gens with { fMin, fMax }                         │
│  Configure audio with { store, midiLower, midiHigher, ... }     │
│  renderUI(state) — subscribed to store, draws chart + buttons   │
│  All DOM event handlers (keyboard, mouse, buttons, drag-drop)   │
│                                                                  │
│  import * as Audio from "./audio.js"                             │
│  import { configure as cfgFG, xFromFreq } from "./freq-gens.js" │
│  import { createStore } from "./state.js"                        │
└──────────┬──────────────────────────────┬────────────────────────┘
           │                              │
           ▼                              ▼
┌────────────────────────┐   ┌──────────────────────────────┐
│       state.js         │   │       audio.js               │
│                        │   │                              │
│  createStore(init) {   │   │  configure({ store, ... })   │
│    _state = {...init}  │   │  AudioContext, Osc, Gain     │
│    _listeners = Set    │   │  Piano note navigation       │
│    getState()          │   │  Calibration (L/R)           │
│    setState(partial)   │   │  Test flow + ear switching   │
│    subscribe(fn)       │   │  Continuous sweep loop       │
│  }                     │   │  Download / loadResults      │
└────────────────────────┘   │  No DOM, no button state     │
                             │  Pure domain logic           │
                             └──────────────────────────────┘
                                          ▲
                                          │ import
                                          │
                             ┌────────────┴────────────┐
                             │     freq-gens.js         │
                             │                         │
                             │  configure({ fMin, fMax })│
                             │  logFreqFromX(x)         │
                             │  xFromFreq(freq)         │
                             │  pianoFreqs generator    │
                             │  freqGen, skipN wrappers │
                             └─────────────────────────┘
```

### Module Pattern

Each module is a native ES module (`export`/`import`) with zero globals. Modules use a `configure({ ... })` pattern to receive app-specific values via closure — no shared mutable state between modules.

**Data flow**: User action → event handler in `main.js` → `Audio.xxx()` → `store.setState()` → `renderUI()` subscriber → DOM update + chart redraw.

---

## main.js — Entry Point & UI Layer

**Imports**: `state.js`, `freq-gens.js`, `audio.js`

**Responsibility**:
1. Define app constants (`F_MIN`, `F_MAX`, `MIDI_LOWER`, `MIDI_HIGHER`, `CALIBRATION_FREQ`, `APP_VERSION`)
2. Create store via `createStore({...})` with complete initial state
3. Configure modules by passing application values
4. All DOM references (cached once at init)
5. `drawChart(state)` — Canvas 2D rendering
6. `renderUI(state)` — store subscriber: chart + status + all button states derived from store
7. All event handlers: buttons, keyboard, mouse wheel, drag-drop file upload
8. Boot: `Audio.initAudio()`

**Button state is fully derived from the store** — no module touches DOM directly. The subscriber checks `mode`, `audioReady`, `audioRunning`, `calibrationGain*`, `thresholds*` and sets `disabled`, `className`, `textContent` on every state change.

---

## state.js — Observable Store Factory

```javascript
export function createStore(initialState)
```

Returns `{ getState, setState, subscribe }`. No defaults, no globals. The full initial state is provided by `main.js`.

---

## freq-gens.js — Frequency Generators

**Uses closure**: `_fMin`, `_fMax` set via `configure({ fMin, fMax })`.

**Exports**:
- `logFreqFromX(x)` — maps `x∈[0,1]` to Hz via `_fMin * (_fMax/_fMin)^x`
- `xFromFreq(freq)` — inverse: Hz → normalized x
- `pianoFreqs(upper, lower)` — generator yielding MIDI note frequencies (`440 * 2^((n-69)/12)`)
- `freqGen(genFn, ...args)` — wrapper with `reset()`, `child()`, iterator protocol
- `skipN(gen, n)` — generator skipping first `n` yielded values

---

## audio.js — Audio Engine & Domain Logic

**Uses closure**: `_store`, `_midiLower`, `_midiHigher`, `_calibrationFreq` set via `configure({ store, midiLower, midiHigher, calibrationFreq })`.

**Module-level state** (private): `audioCtx`, `osc`, `gainNode`, `panner`, `pianoNotes[]`, `currentNoteIndex`, `gainRatioLeft`/`gainRatioRight`, `sweepStopped`/`sweepRunning`.

**No DOM access. No button state. Pure domain logic.**

### Audio Engine
- `ensureAudio()` — creates/resumes AudioContext, sets `audioReady`/`audioRunning` in store
- `initAudio()` — calls `ensureAudio()`, sets status message
- `isAudioRunning()` — returns boolean, resumes if needed
- `setPan(ear)` — updates `StereoPannerNode` pan value
- `startOsc(freq, gain)`, `stopOsc()`, `setFreqFromX(x)`, `setGain(g)`

### Piano Note Navigation
- `calGain(state)` — returns ear-specific calibration gain
- `playCurrentNote()` — plays `pianoNotes[currentNoteIndex]` at `calGain * gainRatio`
- `nextNote()`, `prevNote()` — navigate piano note sequence

### Calibration
- `startCalibration()` — plays `_calibrationFreq` at very low gain
- `finishCalibration()` — saves `currentGain` to ear-specific calibration gain, stops oscillator

### Test Flow
- `startTest()` — generates piano notes via `freqGen(pianoFreqs, ...)` with `skipN(gen, 4)`, starts at index 0
- `markThreshold()` — saves `{x, freq, gain}` to ear's threshold list, auto-switches ear, advances to next note when both ears done

### Sweep
- `sweepEar(points, dur)` — continuous ramp between threshold points using `linearRampToValueAtTime`, updates chart state 15× per segment
- `startSweep()` — loops left ear → right ear continuously until `stopSweep()`
- `stopSweep()` — sets stop flag, loop exits at next checkpoint

### Download / Upload
- `downloadResults()` — builds JSON blob, triggers download
- `loadResults(file)` — `FileReader` → JSON parse → `store.setState` (upload button + drag-drop in main.js)

---

## Application Workflow (6 Steps)

```
1. [Audio]          → Auto-initializes on page load (button shows ✓/⏳/✗ state)
2. [System Volume]  → Enter value (0-100), optional
3. [Calibration]    → ↑/↓ adjust gain, E switch ear, Space confirm (repeat for other ear)
4. [Test Phase]     → →/← navigate piano notes, Space marks threshold (auto ear-switch per note)
5. [Sweep]          → Continuous smooth sweep: left ear all points → right ear all points → loop
6. [Download]       → JSON export with per-ear calibration + thresholds
```

## Known Issues

- **No persistence**: Results exist only in memory until manual download or upload
- **No cancellation**: Test flow cannot be interrupted mid-sequence
- **No re-test**: After test completes, there is no reset to test again (recalibration is needed)
- **setFreqFromX** is exported but unused (frequency is set via `startOsc` in `playCurrentNote`)
