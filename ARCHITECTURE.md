# HOORTEST Architecture

A browser-based Single Page Application for psychoacoustic hearing threshold measurements using piano frequencies with per-ear calibration and auto-ear-switching test flow.

---

## Overview

**Runtime**: Browser, vanilla JS, no build step  
**Audio**: Web Audio API (OscillatorNode, GainNode, StereoPannerNode)  
**State**: Custom observable store (Flux-like pattern)  
**UI**: Canvas 2D API + DOM text updates  
**Frequency range**: 110 Hz – 4186 Hz (piano A2–C8) logarithmic mapping  
**Hearing Test strategy**: Sequential piano notes with per-ear threshold marking, auto-advance to next frequency after both ears done  
**Output**: JSON download (timestamp, OS, system volume, per-ear calibration + thresholds)  
**Input**: Keyboard (arrows, space, E), mouse wheel, buttons, number input  
**Version**: 0.1.0

---

## File Structure

```
index.html        — HTML shell, script loading order
styles.css        — Dark theme, button state classes (.ready/.pending/.error)
state.js          — Observable state store
freq-gens.js      — Piano frequency generators, log-frequency mapping
audio.js          — Audio engine + all application logic
ui.js             — UI rendering + event binding
favicon.svg       — Tab icon
ARCHITECTURE.md   — This file
TODO.md           — Progress tracking
```

Scripts load in dependency order: `state.js` → `freq-gens.js` → `audio.js` → `ui.js`.

---

## Observable Store (Flux-like)

```
                    ┌──────────────────────────────────────────┐
                    │              state.js                     │
                    │  store { getState, setState,              │
                    │          subscribe }                       │
                    │  APP_VERSION                               │
                    └────┬───────────────────────────┬──────────┘
                         │                           │
               getState/setState              subscribe(render)
                         │                           │
               ┌─────────▼──────────┐    ┌───────────▼──────────┐
               │     audio.js       │    │      ui.js           │
               │                    │    │                      │
               │  Audio Engine      │    │  drawChart(state)    │
               │  Piano Navigation  │    │  render(state)       │
               │  Calibration       │    │  Button handlers     │
               │  Test Flow         │    │  Keyboard handlers   │
               │  Sweep             │    │  Mouse wheel         │
               │  Download          │    └──────────────────────┘
               └────────────────────┘
```

All state mutations go through `store.setState()`. Every `setState` triggers all subscribers — `ui.js` subscribes `render` so the chart + status update automatically.

---

## state.js — Observable State Store

**Exports** (globals): `APP_VERSION`, `store`

**`store` API**:
- `getState()` — returns current state reference
- `setState(partial, event?)` — merges partial, logs changes, notifies subscribers
- `subscribe(fn)` — registers listener, returns unsubscribe

**State shape**:

```javascript
{
  mode: "idle",               // "idle" | "calibrate" | "test" | "sweep"
  ear: "left",                // "left" | "right"
  calibrationGainLeft: 0.001, // Reference gain set during left ear calibration
  calibrationGainRight: 0.001,// Reference gain set during right ear calibration
  calibrationFreq: 1000,      // Calibration frequency (1 kHz)
  currentGain: 0.0001,        // Current playback amplitude
  currentX: 0.5,              // Normalized log-frequency [0, 1]
  systemVolume: 50,           // User-reported system volume (0-100)
  thresholdsLeft: [],         // [{x, freq, gain}, ...] sorted by freq
  thresholdsRight: [],        // [{x, freq, gain}, ...] sorted by freq
  status: "",                 // User-facing status message
  info: "",                   // Detail info (current frequency, MIDI, ear)
}
```

---

## freq-gens.js — Piano Frequency Generators

**Module-level constants**:
- `fMin = 110` — A2, lowest piano note used
- `fMax = 4186` — C8, highest piano note used

**Log-frequency mapping** (for chart x-axis):
- `logFreqFromX(x)` — maps `x ∈ [0,1]` to 110–4186 Hz via `fMin * (fMax/fMin)^x`
- `xFromFreq(freq)` — inverse: frequency → normalized x

**Piano note generator**:
- `pianoFreqs(upper=108, lower=33)` — generator yielding frequencies for MIDI notes `lower`..`upper` using formula `440 * 2^((n-69)/12)`. Default covers MIDI 33–108 (A1–C8).
- `freqGen(genFn, ...args)` — wrapper that adds `child()`, `reset()`, and `[Symbol.iterator]()` to a generator function
- `skipN(gen, n)` — generator that skips first `n` yielded values

`startTest()` calls `freqGen(pianoFreqs, midiHigher, midiLower)` then `[...skipN(gen, 4)]` to produce the test note list, skipping the first 4 notes (MIDI 55–58 → A3–B3).

---

## audio.js — Audio Engine & Application Logic

The largest file, containing all domain logic. Everything is a global function.

### Module-level state (globals)

`audioCtx`, `osc`, `gainNode`, `panner`, `pianoNotes[]` (flat array of frequencies), `currentNoteIndex`, `midiLower` (55), `midiHigher` (108), `gainRatioLeft` (0.5), `gainRatioRight` (0.5).

### Audio Engine

- `ensureAudio()` — creates AudioContext if missing, resumes if suspended, updates button state
- `initAudio()` — called at module load (auto-init), enables calibration button
- `startOsc(freq, gain)` — starts sine oscillator → panner (L/R) → gain → destination
- `stopOsc()` — stops and disconnects oscillator
- `setFreqFromX(x)` — maps `x∈[0,1]` to frequency, updates oscillator + store
- `setGain(g)` — clamps and sets gain on GainNode, updates `gainRatioLeft`/`gainRatioRight` for current ear
- `updateAudioBtn()` — sets btnInit class (ready/pending/error) + text (✓/⏳/✗)
- `updateCalibrateBtn()` — sets btnCalibrate class based on both ears' calibration state

### Piano Note Navigation

- `calGain(state)` — returns `calibrationGainLeft` or `calibrationGainRight` based on current ear
- `playCurrentNote()` — reads `pianoNotes[currentNoteIndex]`, computes gain as `calGain * ratio` (per-ear `gainRatio`), starts oscillator, updates state with freq/MIDI info
- `nextNote()` — increment `currentNoteIndex`, call `playCurrentNote()`
- `prevNote()` — decrement `currentNoteIndex`, call `playCurrentNote()`

### Calibration

- `startCalibration()` — plays 1 kHz at very low gain (0.0001), sets calibrate mode
- `finishCalibration()` — saves `currentGain` to ear-specific calibration gain (`calibrationGainLeft` or `calibrationGainRight`), returns to idle. Enables btnTest only when both ears are calibrated.

### Test Flow (Piano Note Sequence)

- `startTest()` — generates piano notes using `freqGen(pianoFreqs, midiHigher, midiLower)` with `skipN(gen, 4)`, resets index, begins test mode
- `markThreshold()` — saves current `{x, freq, gain}` to ear-specific thresholds list:
  - **Left ear**: saves point, switches to right ear, replays same note
  - **Right ear**: saves point, if more notes remain → advances to next note, switches to left ear; if done → stops oscillator, enables Sweep/Download buttons
- Both ears are tested per-frequency before advancing: Space → left threshold → auto-switch to right → Space → right threshold → auto-advance note → back to left

### Gain Ratio Tracking

Volume adjustments during test update a per-ear ratio:
- `gainRatioLeft` — tracks last volume ratio for left ear (gain / calibrationGainLeft)
- `gainRatioRight` — tracks last volume ratio for right ear (gain / calibrationGainRight)
- When switching ears or notes, `playCurrentNote()` reads the correct ear's ratio, so each ear's volume is preserved independently across frequencies.

### Sweep & Download

- `playOnce(freq, gain, ms)` — play tone for duration, returns Promise
- `startSweep()` — async: play each threshold at gain×0.8 then gain×1.2, all frequencies sorted
- `downloadResults()` — build JSON blob with timestamp, OS, system volume, per-ear calibration + thresholds; trigger file download

---

## ui.js — User Interface & Event Binding

### Rendering

- `drawChart(state)` — canvas 2D: black bg, Y-axis gridlines at -60/-40/-20/0/20/40 dB (generated via `Array.from`), X-axis ticks at 125/250/500/1k/2k/4k Hz (generated via `Array.from`), threshold dots (left=green `#2a5`, right=orange `#fa3`), current point (blue `#58a`). Y-position = `20*log10(gain/calGain)` mapped to [-60, +40] dB.
- `render(state)` — calls `drawChart` + updates `#status` / `#info`
- Subscribed to store: `store.subscribe(render)` + initial `render(store.getState())`

### Button Handlers

| Button          | Action                                |
| --------------- | ------------------------------------- |
| `#btnInit`      | Status indicator only (auto-init)     |
| `#inputVolume`  | Store system volume                   |
| `#btnCalibrate` | `startCalibration()`                  |
| `#btnTest`      | `startTest()` (disables self + calibrate) |
| `#btnSweep`     | `startSweep()`                        |
| `#btnDownload`  | `downloadResults()`                   |

### Input

| Input                   | Context           | Action                    |
| ----------------------- | ----------------- | ------------------------- |
| Mouse wheel (on canvas) | Any               | Adjust gain (×1.1 / ÷1.1) |
| E key                   | Any               | Toggle ear left/right, update panner; in test mode replays note, in calibrate updates status |
| ↑/↓                     | Calibrate         | Adjust gain ±10%          |
| Space                   | Calibrate         | `finishCalibration()`     |
| →/←                     | Test              | `nextNote()` / `prevNote()` |
| Space                   | Test              | `markThreshold()`         |

---

## index.html — HTML Shell

Load order: `state.js` → `freq-gens.js` → `audio.js` → `ui.js`

Three panels:

1. **Stappen + Toetsen** — 6-step workflow + keyboard shortcuts
2. **Knoppen** — audio status → system volume → calibrate → test → sweep → download
3. **Grafiek** — `<canvas id="chart" width="800" height="300">` + `#info`

Buttons are progressively enabled as steps complete. Audio initializes automatically on page load (no click needed).

---

## Application Workflow (6 Steps)

```
1. [Audio]          → Auto-initializes on page load (button shows ✓/⏳/✗ state)
2. [System Volume]  → Enter value (0-100), optional
3. [Calibration]    → ↑/↓ adjust gain, E switch ear, Space confirm (repeat for other ear)
4. [Test Phase]     → →/← navigate piano notes, Space marks threshold (auto ear-switch per note)
5. [Sweep]          → Hear each threshold at gain×0.8 then gain×1.2
6. [Download]       → JSON export with per-ear calibration + thresholds
```

---

## Per-Ear Calibration Design

Each ear is calibrated independently at 1 kHz:
- `calibrationGainLeft` — reference gain for left ear
- `calibrationGainRight` — reference gain for right ear
- During calibration, user can switch ears with E key and calibrate each ear separately
- Test phase only starts after both ears have valid calibration values
- Chart plots dB relative to each ear's own calibration: `20*log10(gain / calGain)`

## Known Issues

- **No persistence**: Results exist only in memory until manual download
- **No cancellation**: Sweep / test flow cannot be interrupted
- **Global namespace**: All functions are globals (no modules)
- **DOM in handlers**: Button `disabled` is toggled directly in event handlers, not derived from state
- **setFreqFromX** is defined but unused (frequency is set via `startOsc` in `playCurrentNote`)
