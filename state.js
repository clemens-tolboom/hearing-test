const APP_VERSION = "0.1.0";

const store = {
  _state: {
    mode: "idle",
    ear: "left",
    calibrationGainLeft: 0.001,
    calibrationGainRight: 0.001,
    calibrationFreq: 1000,
    currentGain: 0.0001,
    currentX: 0.5,
    systemVolume: 50,
    thresholdsLeft: [],
    thresholdsRight: [],
    status: "",
    info: "",
  },
  _listeners: new Set(),

  getState() {
    return this._state;
  },

  setState(partial, event) {
    const prev = { ...this._state };
    Object.assign(this._state, partial);
    for (const key of Object.keys(partial)) {
      console.log(`[store] ${event || key}  ${prev[key]} → ${this._state[key]}`);
    }
    this._listeners.forEach(fn => fn(this._state));
  },

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
};
