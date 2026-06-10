import AppKit

/// Sensor view pinned over the top of the Draft window's content view.
///
/// We need this because CSS `:hover` does not fire on
/// `-webkit-app-region: drag` elements — the only reliable way to observe
/// hover over the draggable header is from the AppKit side, through an
/// `NSTrackingArea`. `hitTest` returns `nil` so the view is transparent to
/// mouse events; it never consumes a click, only observes crossings.
final class HoverView: NSView {
  private var trackingArea: NSTrackingArea?
  var callback: BoolCallback?
  var context: UnsafeMutableRawPointer?

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let ta = trackingArea { removeTrackingArea(ta) }
    let ta = NSTrackingArea(
      rect: bounds,
      options: [.mouseEnteredAndExited, .activeAlways, .inVisibleRect],
      owner: self,
      userInfo: nil
    )
    addTrackingArea(ta)
    trackingArea = ta
  }

  override func mouseEntered(with event: NSEvent) {
    callback?(context, true)
  }

  override func mouseExited(with event: NSEvent) {
    callback?(context, false)
  }

  // See class-level comment: pure sensor.
  override func hitTest(_ point: NSPoint) -> NSView? { nil }
}

var hoverView: HoverView?
