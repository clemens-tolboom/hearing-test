/* ---------------------------------------------------------
   FREQUENCY GENERATORS
   --------------------------------------------------------- */
const fMin = 110;
const fMax = 4186;

function logFreqFromX(x) {
    return fMin * Math.pow(fMax / fMin, x);
}

function xFromFreq(freq) {
    return Math.log(freq / fMin) / Math.log(fMax / fMin);
}

/* ---------------------------------------------------------
   PIANO FREQUENCY GENERATOR
   --------------------------------------------------------- */
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

/* ---------------------------------------------------------
   SELF-TEST
   --------------------------------------------------------- */
(function test() {
    console.log("[freq-gens] Testing pianoFreqs generator:");
    const first5 = [];
    for (const f of pianoFreqs(25)) {
        if (first5.length >= 5) break;
        first5.push(f.toFixed(1));
    }
    console.log("  pianoFreqs(25) first 5:", first5.join(", "), "Hz");

    console.log("[freq-gens] Testing freqGen wrapper:");
    const g = freqGen(pianoFreqs, 84, 60);
    const notes = [...g].map(f => f.toFixed(1));
    console.log("  freqGen(pianoFreqs, 84, 60):", notes.length, "notes from", notes[0], "to", notes[notes.length-1], "Hz");

    const r = g.reset();
    const c = g.child(72);
    console.log("  g.reset() =>", r.args.length, "child, g.child(72) =>", [...c].length, "notes");

    console.log("[freq-gens] Testing skipN generator:");
    const skipped = [...skipN(pianoFreqs(28), 3)].map(f => f.toFixed(1));
    console.log("  skipN(pianoFreqs(28), 3): first =", skipped[0], ", length =", skipped.length);
})();
