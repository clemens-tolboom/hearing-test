export function createStore(initialState) {
  const _state = { ...initialState };
  const _listeners = new Set();

  return {
    getState() {
      return _state;
    },
    setState(partial, event) {
      const prev = { ..._state };
      Object.assign(_state, partial);
      for (const key of Object.keys(partial)) {
        console.log(`[store] ${event || key}  ${prev[key]} → ${_state[key]}`);
      }
      _listeners.forEach(fn => fn(_state));
    },
    subscribe(fn) {
      _listeners.add(fn);
      return () => _listeners.delete(fn);
    },
  };
}
