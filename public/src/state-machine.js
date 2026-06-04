export const MODE = Object.freeze({
  IDLE: 'idle',
  CALIBRATING: 'calibrating',
  TESTING: 'testing',
  SWEEPING: 'sweeping',
});

export const AUDIO = Object.freeze({
  INIT: 'init',
  READY: 'ready',
  ERROR: 'error',
});

export const UPLOAD = Object.freeze({
  IDLE: 'idle',
  BUSY: 'busy',
  DONE: 'done',
  ERROR: 'error',
});

const MODE_TRANSITIONS = {
  [MODE.IDLE]: [MODE.CALIBRATING, MODE.TESTING, MODE.SWEEPING],
  [MODE.CALIBRATING]: [MODE.IDLE],
  [MODE.TESTING]: [MODE.IDLE],
  [MODE.SWEEPING]: [MODE.IDLE],
};

const AUDIO_TRANSITIONS = {
  [AUDIO.INIT]: [AUDIO.READY, AUDIO.ERROR],
  [AUDIO.READY]: [AUDIO.ERROR],
  [AUDIO.ERROR]: [],
};

export function createStateMachine(store, hooks = {}) {
  function transitionMode(newMode, extra) {
    const current = store.getState().mode;
    if (current === newMode) return true;
    if (!MODE_TRANSITIONS[current]?.includes(newMode)) {
      console.warn(`[sm] Invalid mode transition: ${current} → ${newMode}`);
      return false;
    }
    hooks.onExitMode?.[current]?.();
    store.setState({ mode: newMode, ...extra }, `mode:${current}→${newMode}`);
    hooks.onEnterMode?.[newMode]?.();
    return true;
  }

  function transitionAudio(newStatus) {
    const current = store.getState().audioStatus;
    if (current === newStatus) return true;
    if (!AUDIO_TRANSITIONS[current]?.includes(newStatus)) {
      console.warn(`[sm] Invalid audio transition: ${current} → ${newStatus}`);
      return false;
    }
    store.setState({ audioStatus: newStatus }, `audio:${current}→${newStatus}`);
    hooks.onEnterAudio?.[newStatus]?.();
    return true;
  }

  function setUploadStatus(status) {
    store.setState({ uploadStatus: status }, `upload:${status}`);
  }

  function recalcPermissions() {
    const s = store.getState();
    const leftDone = s.calibrationGainLeft !== 0.001;
    const rightDone = s.calibrationGainRight !== 0.001;
    store.setState({
      canTest: leftDone && rightDone,
      canSweep: s.thresholdsLeft.length >= 2 || s.thresholdsRight.length >= 2,
    });
  }

  return { transitionMode, transitionAudio, setUploadStatus, recalcPermissions };
}
