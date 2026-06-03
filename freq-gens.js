let _fMin = 110;
let _fMax = 4186;

export function configure({ fMin, fMax }) {
  _fMin = fMin;
  _fMax = fMax;
}

export function logFreqFromX(x) {
  return _fMin * Math.pow(_fMax / _fMin, x);
}

export function xFromFreq(freq) {
  return Math.log(freq / _fMin) / Math.log(_fMax / _fMin);
}

export function* pianoFreqs(upper = 108, lower = 33) {
  for (let n = lower; n <= upper; n++) {
    yield 440 * Math.pow(2, (n - 69) / 12);
  }
}

export function freqGen(genFn, ...args) {
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
    },
  };
}

export function* skipN(gen, n) {
  const it = gen[Symbol.iterator]();
  for (let i = 0; i < n; i++) it.next();
  yield* it;
}
