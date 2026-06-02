const store = {
  _state: {
    mode: "idle",
    ear: "left",
    calibrationGain: 0.001,
    calibrationEar: null,
    calibrationFreq: 1000,
    currentGain: 0.0001,
    currentX: 0.5,
    systemVolume: 50,
    thresholdsLeft: [],
    thresholdsRight: [],
    intervalHistory: [],
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
