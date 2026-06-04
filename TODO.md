# TODO

## Done

- [x] Separate HTML, CSS, JS into separate files
- [x] Observable state store (getState / setState / subscribe)
- [x] Replace volume button with number input (default 50)
- [x] Y-axis: dB scale (−60 to +40) with gridlines and labels
- [x] X-axis: piano frequency range (110–4186 Hz) with log mapping
- [x] Piano note navigation: → next note, ← prev note, auto-ear-switching on Space
- [x] Mouse wheel for volume control
- [x] Ear toggle (E key) with per-ear gain ratio tracking
- [x] Calibrate each ear independently at 1 kHz
- [x] Test flow: per-frequency left→right ear switching, auto-advance
- [x] Continuous audio sweep: smooth freq+gain interpolation, left ear → right ear → loop
- [x] Sweep cancel button (Stop sweep)
- [x] JSON download with per-ear calibration + thresholds
- [x] JSON upload (file picker + drag-drop) to restore previous data
- [x] Version number in header
- [x] Audio auto-initializes on page load
- [x] Button state classes (ready/pending/error)
- [x] Store event logging to console
- [x] Layout: Stappen | Toetsen / Knoppen / Grafiek
- [x] Replace interval-queue BFS with sequential piano note test flow
- [x] Frequency generator utilities (pianoFreqs, freqGen, skipN)
- [x] Refactor to native ES modules: state.js, freq-gens.js, audio.js, main.js
- [x] Move all UI (DOM, chart, events) from ui.js into main.js
- [x] Move all app constants to main.js entry point
- [x] Pure domain logic in audio.js — no DOM, no button state
- [x] Laat gebruiker freq onder/boven grens instellen .. voeg die ook toe aan imex van json ... dropdown met A octaaf noten
- [x] de grafiek schaal niet mee met frequencies
- [x] we hebben geen state transition manager ... de buttons doen het nog steeds niet goed/lekker ... kan bijv testfase niet stoppen/heeft geen kleur
- [x] Reset knop — stopt actieve operatie + wist alle data
- [x] Test start altijd met linker oor

## To Do
- [ ] de Y as moet bijschalen/afschalen als data er niet meer inpast of teveel boven/onder ruimte er is
- [ ] Vind andere manier voor J/T-script-obfuscator\*\* (heavier obfuscation) via deno of bun(?)
- [ ] **BFS frequentie generator** — binaire zoekboom i.p.v. lineaire pianonoten. Elk interval splitst in midden, pijltjes navigeren door de boom (omhoog/omlaag = ouder/kind, links/rechts = sibling). Gebruiker hoort een freq en kiest "wel/niet hoorbaar" totdat de drempel op een bepaalde diepte is bepaald.
