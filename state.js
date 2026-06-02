const store = {
  _state: {
    mode: "idle",
    ear: "left",
    calibrationGain: 0.001,
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

  setState(partial) {
    Object.assign(this._state, partial);
    this._listeners.forEach(fn => fn(this._state));
  },

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }
};
