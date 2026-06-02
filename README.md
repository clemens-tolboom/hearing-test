# Hootest

## Ik

Ik wil een hoor test SPA/HTML maken waarbij bijljes kan gebruiken om frequentie (links, rechts) en volume (op/neer) kan gebruiken. De aanpak moet binair verdiepen. stel range [0,1] stel logarithme frequentie voor dan eerst 0 en 1, 1/2, 1/4, 3/4 etc dus test tussen de gevonden intervallen ... met links recht kan gebruiker tussen de verschillende interval waarden kiezen

## AI

Klinkt eigenlijk als een heel nette, wiskundig “schone” aanpak 👍

Je idee bevat een paar sterke punten:

- **Binaire zoekstrategie:** Door steeds het interval te halveren (0, 1 → 1/2 → 1/4, 3/4, etc.) convergeer je snel naar de drempel. Dat is efficiënt en voorspelbaar.
- **Logaritmische frequentieschaal:** Dat sluit goed aan bij hoe wij toonhoogte ervaren (octaven zijn logaritmisch), dus een mapping van \([0,1]\) naar frequentie via een log-schaal is heel logisch.
- **Pijltjestoetsen voor interactie:** Links/rechts voor frequentie (of intervalkeuze) en omhoog/omlaag voor volume voelt intuïtief en is snel te bedienen, zeker voor een SPA.

Een paar dingen om over na te denken:

- **UI-feedback:** Laat de gebruiker duidelijk zien waar hij/zij zit in de “range” (bijv. een slider of labels: laag ↔ hoog).
- **Kalibratie:** Hoe ga je volume kalibreren? Laptop-speakers vs. koptelefoon maakt veel uit. Misschien een korte kalibratiestap vooraf.
- **Stopcriterium:** Wanneer is de drempel “gevonden”? Na N verdiepingen, of als de gebruiker meerdere keren hetzelfde antwoord geeft rond een bepaalde waarde?
- **Links/rechts-oor:** Ga je echt per oor testen (met panning), en hoe maak je dat duidelijk in de interface?

Maar conceptueel: ja, dit klinkt als een solide basis voor een simpele, browser-based hoortest.  
Waar twijfel je zelf het meest over: de UX, de wiskunde erachter, of de praktische bruikbaarheid?

## Ik

UI: grafiek: x = log(freq), y1 = volume (huidige) y2 = kantel punt van wel niet horen van freq

Kalibratie: hoe doe je dat ... laat maar in code zien

Ik denk dat we volume alleen verhogen maar gebruiker kan beide: spatie betekent volgens gebruiker is dit het kantel.

Laat gebruiker kiezen tussen kant (switch/toggle).

Nadat gebruiker zelf heeft getest wil ik een freq sweep met volume boven en onder het kantelpunt zodat we later kunnen fine tunen

## AI

Je idee wordt steeds concreter — en eerlijk gezegd begint het op een verrassend elegante _psycho-akoestische mini‑tool_ te lijken. Ik loop door je punten heen en geef meteen een **werkbare UI‑aanpak**, plus **codevoorbeelden** voor kalibratie, input‑handling en de sweep‑fase.

---

## 🎧 UI‑concept: grafiek met log‑freq (x) en volume (y)

Je grafiek‑idee is sterk. Je hebt drie lagen:

1. **Log‑frequentie‑as** (x)
   - Mapping:  
     \[
     f = f*{\min} \cdot (f*{\max}/f\_{\min})^x
     \]  
     Zo blijft de perceptie lineair.

2. **Huidig volume** (y1)
   - Dit is de waarde die je tijdens de test aanpast.

3. **Kantelpunt‑curve** (y2)
   - Per frequentie sla je op: _volume waarbij gebruiker “ja, ik hoor het” drukt_.

Visueel kun je dit tekenen met `<canvas>` of een mini‑chartlib.  
Een simpele canvas‑schets:

```html
<canvas id="chart" width="600" height="300"></canvas>
```

---

## 🎚️ Kalibratie — “laat maar in code zien”

Hier is een **minimaal werkende kalibratie‑routine**:

- Speel een toon op vaste frequentie (bijv. 1 kHz).
- Laat gebruiker met ↑/↓ het volume instellen tot “comfortabel luid”.
- Sla die waarde op als `calibrationGain`.

```js
async function calibrate() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.frequency.value = 1000;
  gain.gain.value = 0.0001; // start heel zacht

  osc.connect(gain).connect(ctx.destination);
  osc.start();

  let vol = gain.gain.value;

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") vol *= 1.1;
    if (e.key === "ArrowDown") vol /= 1.1;
    gain.gain.value = vol;

    if (e.key === " ") {
      gain.gain.value = 0;
      osc.stop();
      calibrationGain = vol;
    }
  });
}
```

Dit is simpel maar effectief.  
Je kunt later een _absolute_ calibratie toevoegen met pink noise, maar dit is genoeg voor een eerste versie.

---

## 🎯 Testlogica: binaire verdieping + spatie = kantelpunt

Je flow:

1. Kies frequentie‑interval \([a,b]\)
2. Test midden \(m\)
3. Gebruiker drukt:
   - **↑/↓** → volume aanpassen
   - **spatie** → “dit is mijn hoor‑drempel”
4. Sla drempel op voor frequentie \(m\)
5. Gebruiker kiest links/rechts om verder te testen in \([a,m]\) of \([m,b]\)

Een compacte implementatie:

```js
let left = 0,
  right = 1; // genormaliseerd
let currentX = 0.5;

function nextStep(direction) {
  if (direction === "left") right = currentX;
  if (direction === "right") left = currentX;
  currentX = (left + right) / 2;
  playToneAt(currentX);
}
```

---

## 🔄 Links/rechts oor (toggle)

Gewoon een simpele toggle:

```js
let ear = "left";

function toggleEar() {
  ear = ear === "left" ? "right" : "left";
}
```

In WebAudio:

```js
const panner = new StereoPannerNode(ctx, { pan: ear === "left" ? -1 : 1 });
osc.connect(panner).connect(gain).connect(ctx.destination);
```

---

## 🔊 Sweep na afloop (boven en onder kantelpunt)

Je idee is slim:

- Sweep door alle frequenties
- Speel twee volumes:
  - `threshold * 0.8`
  - `threshold * 1.2`
- Zo kun je later de curve verfijnen.

Voorbeeld:

```js
async function sweep(thresholds) {
  for (const [freq, thr] of thresholds) {
    await play(freq, thr * 0.8, 200);
    await play(freq, thr * 1.2, 200);
  }
}
```

---

## 🧠 Waarom dit werkt

- Log‑freq sluit aan bij menselijke perceptie.
- Binaire verdieping convergeert snel naar drempels.
- Volume‑aanpassing door gebruiker maakt het subjectief maar reproduceerbaar.
- De sweep valideert en verfijnt de curve.

Het is een verrassend robuust ontwerp.

---

## Wil je dat ik een **volledige SPA‑structuur** voor je genereer (HTML + JS + UI‑flow), of eerst de **grafiek‑rendering** uitwerk?

## Ik

Graag hele spa

## AI

Hier gaan we dan — een minimale maar complete SPA in één HTML‑bestand, met:

- **Kalibratie**
- **Binaire hoortest** (freq + volume)
- **Links/rechts‑oor toggle**
- **Grafiek met drempelpunten**
- **Sweep‑fase boven/onder kantelpunt**

Je kunt dit direct als `index.html` opslaan en openen in een moderne browser.

```html
<!DOCTYPE html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <title>Hoor test SPA</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        margin: 0;
        padding: 1rem 2rem;
        background: #111;
        color: #eee;
      }
      h1,
      h2 {
        margin: 0.5rem 0;
      }
      .row {
        display: flex;
        gap: 2rem;
        margin-top: 1rem;
      }
      .panel {
        flex: 1;
        border: 1px solid #444;
        padding: 1rem;
        border-radius: 8px;
        background: #181818;
      }
      button {
        padding: 0.4rem 0.8rem;
        margin: 0.2rem;
        border-radius: 4px;
        border: 1px solid #555;
        background: #222;
        color: #eee;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .status {
        font-size: 0.9rem;
        color: #ccc;
        margin-top: 0.5rem;
        white-space: pre-line;
      }
      canvas {
        background: #000;
        border-radius: 4px;
      }
      .kbd {
        display: inline-block;
        padding: 0.1rem 0.3rem;
        border-radius: 3px;
        border: 1px solid #666;
        font-size: 0.8rem;
        background: #222;
      }
      .tag {
        display: inline-block;
        padding: 0.1rem 0.4rem;
        border-radius: 999px;
        font-size: 0.75rem;
        background: #333;
        margin-left: 0.3rem;
      }
    </style>
  </head>
  <body>
    <h1>Hoor test (binaire SPA)</h1>
    <p>
      Stappen:
      <br />1. Kalibratie (1 kHz, stel comfortabel volume in met
      <span class="kbd">↑</span>/<span class="kbd">↓</span>, bevestig met
      <span class="kbd">spatie</span>) <br />2. Testfase: frequenties en volumes
      met pijltjestoetsen <br />3. Sweep: controle boven/onder kantelpunt
    </p>

    <div class="row">
      <div class="panel">
        <h2>Besturing</h2>
        <p>
          <b>Kalibratie:</b><br />
          - <span class="kbd">↑</span>/<span class="kbd">↓</span> volume<br />
          - <span class="kbd">spatie</span> bevestig kalibratie
        </p>
        <p>
          <b>Testfase:</b><br />
          - <span class="kbd">↑</span>/<span class="kbd">↓</span> volume<br />
          - <span class="kbd">←</span>/<span class="kbd">→</span> kies interval
          (lager/hoger freq)<br />
          - <span class="kbd">spatie</span> markeer kantelpunt voor huidige
          frequentie
        </p>
        <p>
          <b>Algemeen:</b><br />
          - <span class="kbd">E</span> wissel oor (links/rechts)<br />
          - <span class="kbd">T</span> start testfase<br />
          - <span class="kbd">S</span> start sweep na test
        </p>

        <button id="btnInit">Audio initialiseren</button>
        <button id="btnCalibrate" disabled>Kalibratie starten</button>
        <button id="btnTest" disabled>Testfase starten</button>
        <button id="btnSweep" disabled>Sweep starten</button>

        <div class="status" id="status"></div>
      </div>

      <div class="panel">
        <h2>Grafiek</h2>
        <p>
          x = log-frequentie, y = volume<br />
          <span class="tag" style="background:#2a5;">groen</span>
          kantelpunten<br />
          <span class="tag" style="background:#58a;">blauw</span> huidig punt
        </p>
        <canvas id="chart" width="600" height="300"></canvas>
        <div class="status" id="info"></div>
      </div>
    </div>

    <script>
      // --- Audio & model ---
      let audioCtx = null;
      let osc = null;
      let gainNode = null;
      let panner = null;

      const fMin = 200; // Hz
      const fMax = 8000; // Hz

      let calibrationGain = 0.001;
      let currentGain = 0.0001;
      let currentX = 0.5; // genormaliseerde log-freq [0,1]
      let left = 0.0;
      let right = 1.0;

      let ear = "left"; // "left" | "right"
      let mode = "idle"; // "idle" | "calibrate" | "test" | "sweep"

      // thresholds: array van { x, freq, gain }
      const thresholds = [];

      const statusEl = document.getElementById("status");
      const infoEl = document.getElementById("info");
      const btnInit = document.getElementById("btnInit");
      const btnCalibrate = document.getElementById("btnCalibrate");
      const btnTest = document.getElementById("btnTest");
      const btnSweep = document.getElementById("btnSweep");
      const canvas = document.getElementById("chart");
      const ctx2d = canvas.getContext("2d");

      function logFreqFromX(x) {
        return fMin * Math.pow(fMax / fMin, x);
      }

      function xFromFreq(freq) {
        return Math.log(freq / fMin) / Math.log(fMax / fMin);
      }

      function setStatus(msg) {
        statusEl.textContent = msg;
      }

      function setInfo(msg) {
        infoEl.textContent = msg;
      }

      function initAudio() {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        osc = audioCtx.createOscillator();
        gainNode = audioCtx.createGain();
        panner = new StereoPannerNode(audioCtx, {
          pan: ear === "left" ? -1 : 1,
        });

        osc.type = "sine";
        osc.frequency.value = 1000;
        gainNode.gain.value = 0.0001;

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

      function updatePanner() {
        if (panner) {
          panner.pan.value = ear === "left" ? -1 : 1;
        }
      }

      function setFreqFromX(x) {
        currentX = Math.min(1, Math.max(0, x));
        const f = logFreqFromX(currentX);
        if (osc) osc.frequency.value = f;
        return f;
      }

      function setGain(g) {
        currentGain = Math.max(0.0000001, g);
        if (gainNode) gainNode.gain.value = currentGain;
      }

      function drawChart() {
        const w = canvas.width;
        const h = canvas.height;

        ctx2d.clearRect(0, 0, w, h);

        // achtergrond
        ctx2d.fillStyle = "#000";
        ctx2d.fillRect(0, 0, w, h);

        // assen
        ctx2d.strokeStyle = "#444";
        ctx2d.lineWidth = 1;
        ctx2d.beginPath();
        ctx2d.moveTo(40, 10);
        ctx2d.lineTo(40, h - 20);
        ctx2d.lineTo(w - 10, h - 20);
        ctx2d.stroke();

        // labels
        ctx2d.fillStyle = "#aaa";
        ctx2d.font = "10px system-ui";
        ctx2d.fillText("volume", 5, 15);
        ctx2d.fillText("freq (log)", w - 70, h - 8);

        // grid freq
        ctx2d.fillStyle = "#555";
        const freqs = [250, 500, 1000, 2000, 4000, 8000];
        freqs.forEach((f) => {
          const x = 40 + xFromFreq(f) * (w - 60);
          ctx2d.fillRect(x, h - 20, 1, 5);
          ctx2d.fillText(f.toString(), x - 10, h - 25);
        });

        // thresholds (groen)
        if (thresholds.length > 0) {
          ctx2d.fillStyle = "#2a5";
          thresholds.forEach((t) => {
            const x = 40 + t.x * (w - 60);
            const y = h - 20 - Math.log10(t.gain / calibrationGain + 1e-7) * 40;
            ctx2d.beginPath();
            ctx2d.arc(x, y, 3, 0, Math.PI * 2);
            ctx2d.fill();
          });
        }

        // huidig punt (blauw)
        const xCur = 40 + currentX * (w - 60);
        const yCur =
          h - 20 - Math.log10(currentGain / calibrationGain + 1e-7) * 40;
        ctx2d.fillStyle = "#58a";
        ctx2d.beginPath();
        ctx2d.arc(xCur, yCur, 4, 0, Math.PI * 2);
        ctx2d.fill();
      }

      function startCalibration() {
        mode = "calibrate";
        setStatus("Kalibratie: stel volume in met ↑/↓, bevestig met spatie.");
        stopOsc();
        initAudio();
        setFreqFromX(xFromFreq(1000)); // 1 kHz
        setGain(0.0001);
        drawChart();
      }

      function finishCalibration() {
        calibrationGain = currentGain;
        mode = "idle";
        stopOsc();
        setStatus("Kalibratie klaar. Druk op 'Testfase starten' of toets T.");
        btnTest.disabled = false;
        drawChart();
      }

      function startTest() {
        mode = "test";
        stopOsc();
        initAudio();
        left = 0.0;
        right = 1.0;
        currentX = 0.5;
        const f = setFreqFromX(currentX);
        setGain(calibrationGain * 0.5);
        setStatus(
          "Testfase: gebruik ↑/↓ voor volume, ←/→ voor lager/hoger freq, spatie = kantelpunt.",
        );
        setInfo(
          `Freq ≈ ${f.toFixed(0)} Hz, oor: ${ear}, gain: ${currentGain.toExponential(2)}`,
        );
        drawChart();
      }

      function markThreshold() {
        const f = logFreqFromX(currentX);
        thresholds.push({ x: currentX, freq: f, gain: currentGain });
        thresholds.sort((a, b) => a.freq - b.freq);
        setStatus(
          `Kantelpunt opgeslagen bij ~${f.toFixed(0)} Hz (gain=${currentGain.toExponential(2)}). Ga verder met ←/→ of andere freq.`,
        );
        drawChart();
      }

      function chooseInterval(direction) {
        if (direction === "left") {
          right = currentX;
        } else if (direction === "right") {
          left = currentX;
        }
        currentX = (left + right) / 2;
        const f = setFreqFromX(currentX);
        setInfo(
          `Freq ≈ ${f.toFixed(0)} Hz, oor: ${ear}, gain: ${currentGain.toExponential(2)}`,
        );
        drawChart();
      }

      async function playOnce(freq, gain, durationMs) {
        return new Promise((resolve) => {
          const ctx =
            audioCtx ||
            new (window.AudioContext || window.webkitAudioContext)();
          audioCtx = ctx;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          const p = new StereoPannerNode(ctx, { pan: ear === "left" ? -1 : 1 });

          o.type = "sine";
          o.frequency.value = freq;
          g.gain.value = gain;

          o.connect(p).connect(g).connect(ctx.destination);
          o.start();

          setTimeout(() => {
            o.stop();
            o.disconnect();
            resolve();
          }, durationMs);
        });
      }

      async function startSweep() {
        if (thresholds.length === 0) {
          setStatus("Geen kantelpunten gevonden. Doe eerst de testfase.");
          return;
        }
        mode = "sweep";
        setStatus("Sweep gestart: boven/onder kantelpunt. Wacht tot klaar...");
        stopOsc();

        for (const t of thresholds) {
          const f = t.freq;
          const gLow = t.gain * 0.8;
          const gHigh = t.gain * 1.2;
          setInfo(`Sweep: ${f.toFixed(0)} Hz (onder drempel)`);
          await playOnce(f, gLow, 250);
          await new Promise((r) => setTimeout(r, 150));
          setInfo(`Sweep: ${f.toFixed(0)} Hz (boven drempel)`);
          await playOnce(f, gHigh, 250);
          await new Promise((r) => setTimeout(r, 250));
        }

        mode = "idle";
        setStatus(
          "Sweep klaar. Je kunt de resultaten bekijken of opnieuw testen.",
        );
        drawChart();
      }

      function toggleEar() {
        ear = ear === "left" ? "right" : "left";
        updatePanner();
        const f = logFreqFromX(currentX);
        setInfo(
          `Freq ≈ ${f.toFixed(0)} Hz, oor: ${ear}, gain: ${currentGain.toExponential(2)}`,
        );
        drawChart();
      }

      // --- Event handlers ---
      btnInit.addEventListener("click", () => {
        if (!audioCtx) {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        setStatus("Audio geinitialiseerd. Start kalibratie.");
        btnCalibrate.disabled = false;
        btnInit.disabled = true;
      });

      btnCalibrate.addEventListener("click", () => {
        startCalibration();
      });

      btnTest.addEventListener("click", () => {
        startTest();
      });

      btnSweep.addEventListener("click", () => {
        startSweep();
      });

      window.addEventListener("keydown", (e) => {
        if (e.repeat) return;

        if (e.key === "e" || e.key === "E") {
          toggleEar();
          return;
        }

        if (e.key === "t" || e.key === "T") {
          if (audioCtx && calibrationGain > 0) {
            startTest();
          }
          return;
        }

        if (e.key === "s" || e.key === "S") {
          if (audioCtx) {
            startSweep();
          }
          return;
        }

        if (!audioCtx) return;

        if (mode === "calibrate") {
          if (e.key === "ArrowUp") {
            setGain(currentGain * 1.1);
          } else if (e.key === "ArrowDown") {
            setGain(currentGain / 1.1);
          } else if (e.key === " ") {
            finishCalibration();
            btnSweep.disabled = false;
          }
          drawChart();
        } else if (mode === "test") {
          if (e.key === "ArrowUp") {
            setGain(currentGain * 1.1);
          } else if (e.key === "ArrowDown") {
            setGain(currentGain / 1.1);
          } else if (e.key === "ArrowLeft") {
            chooseInterval("left");
          } else if (e.key === "ArrowRight") {
            chooseInterval("right");
          } else if (e.key === " ") {
            markThreshold();
          }
          const f = logFreqFromX(currentX);
          setInfo(
            `Freq ≈ ${f.toFixed(0)} Hz, oor: ${ear}, gain: ${currentGain.toExponential(2)}`,
          );
        }

        drawChart();
      });

      // initial draw
      drawChart();
      setStatus("Klik op 'Audio initialiseren' om te beginnen.");
    </script>
  </body>
</html>
```

Als je wilt, kunnen we in een volgende stap:

- de grafiek mooier schalen (y‑as in dB t.o.v. kalibratie),
- per oor aparte curves tekenen,
- of de binaire strategie verfijnen (bijv. aantal stappen per frequentie limiteren).
