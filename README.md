# Hoor Test – Piano Frequencies

Check out on [GitHub Pages](https://clemens-tolboom.github.io/hearing-test/)

A browser-based single-page application for psychoacoustic hearing threshold measurements using piano-frequency sine tones, per-ear calibration, and an auto-switching test flow.

![App screenshot](screenshot.png)

---

## Features

- **5-step workflow**: Audio → Calibration → Test → Sweep → Download
- **Per-ear calibration** at 1 kHz
- **Piano frequency range**: 110 Hz – 4186 Hz (A2–C8)
- **Real-time chart** showing thresholds in dB re: calibration gain
- **Continuous sweep** playback of threshold results
- **JSON export/import** with timestamp, OS info, and all measurements
- **Keyboard, mouse & touch** controls — works on desktop and mobile
- **Mobile-friendly** responsive layout with touch controls
- **Zero dependencies** — runs in any modern browser

## How to Use

### 1. Audio

Audio initializes automatically on page load. The button shows ✓ (ready), ⏳ (pending), or ✗ (error).

### 2. Calibration

Calibrate each ear independently at 1 kHz:

- **↑ / ↓** or **+Vol / −Vol buttons** — adjust gain until you can just hear the tone
- **E** or **ear buttons (👂)** — switch between left and right ear
- **Space** or **Bevestig button** — confirm calibration for the current ear

The app auto-advances to the other ear after confirmation.

### 3. Test Phase

Navigate through piano notes and mark your hearing threshold for each note:

- **→ / ←** or **Vorige / Volgende buttons** — next / previous piano note
- **Space** or **Markeer button** — mark threshold for the current ear (auto-switches to the other ear)
- Once both ears are done for a note, the app advances to the next note

### 4. Sweep

Plays a continuous smooth frequency sweep through both ears' threshold points:

- Left ear all points → right ear all points → loops until stopped
- Click the **Stop** button or the **Sweep** button again to stop

### 5. Download

Exports a JSON file containing:

- Timestamp and user agent
- Per-ear calibration gains
- All threshold measurements (frequency, gain, normalized x-position)

### Uploading Previous Results

Drag-and-drop a `.json` results file onto the page, or use the **Upload resultaten** button to restore previous data for viewing.

### Controls

| Input                       | Action                                 |
| --------------------------- | -------------------------------------- |
| `↑` / `↓`                  | Adjust gain during calibration         |
| `→` / `←`                  | Next / previous piano note during test |
| `Space`                     | Confirm calibration / mark threshold   |
| `E`                         | Switch ear                             |
| Mouse wheel / touch drag    | Adjust volume / gain                   |
| +Vol / −Vol buttons         | Adjust gain during calibration         |
| Vorige / Volgende buttons   | Navigate notes during test             |
| Markeer / Bevestig buttons  | Confirm or mark threshold              |
| Ear buttons (👂)            | Switch ear                             |

---

## For Developers

### Tech Stack

| Layer         | Technology                                                       |
| ------------- | ---------------------------------------------------------------- |
| Runtime       | Browser, vanilla JS                                              |
| Module system | Native ES Modules (`type="module"`)                              |
| Audio         | Web Audio API (`OscillatorNode`, `GainNode`, `StereoPannerNode`) |
| State         | Custom observable store (`getState` / `setState` / `subscribe`)  |
| UI            | Canvas 2D API + DOM text updates                                 |
| Styling       | Plain CSS, dark theme                                            |
| Build         | None required — no npm, no bundler                               |

### Architecture

The app is split into ES modules:

```
index.html  →  main.js  →  audio.js
                    ↓          ↑
            state-machine.js  freq-gens.js
                    ↓
              state.js
```

| Module             | Purpose                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `main.js`          | Entry point: constants, store creation, chart rendering, event handlers               |
| `audio.js`         | Audio engine + domain logic (calibration, test flow, sweep, download). No DOM access. |
| `freq-gens.js`     | Frequency generators: log mapping, piano note sequence, generator wrappers            |
| `state.js`         | Observable store factory                                                              |
| `state-machine.js` | Mode/audio/upload state transitions with validation                                   |

**Data flow**: User action → `main.js` event handler → `audio.js` function → `store.setState()` → subscriber calls `renderUI()` → DOM + chart update.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full architecture documentation, module diagrams, and detailed description of each module.

### Local Development

No dependencies required. Serve the directory with any static HTTP server:

```bash
# Using npx
npx serve .

# Using Deno
deno run --allow-net --allow-read jsr:@std/http/file-server .

# Using Python
python -m http.server
```

Then open `http://localhost:3000` (or the port shown) in Chrome, Firefox, or Edge.

> **Note**: Opening `index.html` directly via `file://` may not work because browsers block ES module imports from the file protocol.

### Project Structure

```
├── public/
│   ├── index.html      # HTML shell (Dutch UI)
│   ├── styles.css      # Dark theme, button state classes
│   ├── main.js         # Entry point: constants, store, chart, events
│   └── src/
│       ├── audio.js    # Audio engine + domain logic (no DOM)
│       ├── freq-gens.js# Frequency generators (log mapping, piano notes)
│       ├── state.js    # Observable store factory
│       └── state-machine.js  # Mode/audio/upload state transitions
├── docs/               # Built output for GitHub Pages
├── favicon.svg         # Tab icon
├── ARCHITECTURE.md     # Detailed architecture docs
├── TODO.md             # Progress tracking
├── AGENTS.md           # AI agent instructions
├── deno.json           # Task definitions (bundle, dev server)
└── CHAT.md             # Design conversation history
```

### Deployment

The `docs/` folder is pre-configured for **GitHub Pages** (serve from `docs/` on the main branch). Push to GitHub and enable Pages — it just works.

Build (optional bundle for production):

```bash
deno task docs
```

### Known Issues

- **No persistence**: Results live in memory until manually downloaded or re-uploaded
- **`setFreqFromX`** is exported but unused (frequency is set via `startOsc` in `playCurrentNote`)

### License

MIT — use freely, modify, share.
