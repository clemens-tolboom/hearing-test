# TODO

## Done

- [x] Separate HTML, CSS, JS into separate files
- [x] Split JS into state.js, freq-gens.js, audio.js, ui.js
- [x] Observable state store (getState / setState / subscribe)
- [x] Replace volume button with number input (default 50)
- [x] Y-axis: dB scale (−60 to +40) with gridlines and labels
- [x] X-axis: piano frequency range (110–4186 Hz) with log mapping
- [x] Piano note navigation: → next note, ← prev note, auto-ear-switching on Space
- [x] Mouse wheel for volume control
- [x] Ear toggle (E key) with per-ear gain ratio tracking
- [x] Calibrate each ear independently at 1 kHz
- [x] Test flow: per-frequency left→right ear switching, auto-advance
- [x] Sweep playback (threshold ×0.8 / ×1.2)
- [x] JSON download with per-ear calibration + thresholds
- [x] Version number in header
- [x] Audio auto-initializes on page load
- [x] Button state classes (ready/pending/error)
- [x] Store event logging to console
- [x] Layout: Stappen | Toetsen / Knoppen / Grafiek
- [x] Replace interval-queue BFS with sequential piano note test flow
- [x] frequency generator utilities (pianoFreqs, freqGen, skipN)

## To Do

- [ ] Audio sweep sould do first left ear all in smooth interpolation between freq and volume instead of ticking then right ear continuesly repeat until button clicked again.
- [ ] Note: No known bugs. Feature requests welcome.
