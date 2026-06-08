// CommonJS entry point — Electron's `main` process is CJS, so the native
// .node module is loaded via `require`. We re-export a tiny façade so the
// rest of the app talks to a stable shape even if the binding moves.
const binding = require('./build/Release/window_events.node');

module.exports = {
  subscribeToMouseUp: binding.subscribeToMouseUp,
  subscribeToMouseDown: binding.subscribeToMouseDown,
  /**
   * Fires while the left mouse button is HELD and the cursor moves
   * (`NSEventMaskLeftMouseDragged`). No events emit while the button is
   * up — keeps the idle path zero-cost. Coordinates are NOT delivered;
   * read them via `screen.getCursorScreenPoint()` inside the callback.
   */
  subscribeToMouseDrag: binding.subscribeToMouseDrag,
  unsubscribe: binding.unsubscribe,
};
