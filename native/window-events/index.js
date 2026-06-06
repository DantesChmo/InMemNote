// CommonJS entry point — Electron's `main` process is CJS, so the native
// .node module is loaded via `require`. We re-export a tiny façade so the
// rest of the app talks to a stable shape even if the binding moves.
const binding = require('./build/Release/window_events.node');

module.exports = {
  /**
   * Start receiving left-mouse-up notifications. `callback` fires on every
   * release (both inside and outside the app's own windows). Safe to call
   * more than once — subsequent calls before `unsubscribe()` are no-ops.
   */
  subscribeToMouseUp: binding.subscribeToMouseUp,
  /** Tear down the AppKit observers and release the JS callback handle. */
  unsubscribe: binding.unsubscribe,
};
