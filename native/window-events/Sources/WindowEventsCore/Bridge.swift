// C ABI surface exposed by WindowEventsCore.
//
// The .mm shim (`src/shim.mm`) treats this file as the implementation of the
// C declarations in `src/InmemnoteBridge.h`. Keep the two in sync; the
// @_cdecl name on each function below MUST match its C-side prototype.
//
// All entry points are MAIN-THREAD ONLY. AppKit (NSEvent monitors,
// NSTrackingArea, NSView mutation) requires it, and N-API hands these calls
// to us from the JS main thread anyway.
//
// `context` is an opaque pointer the shim hands back to itself on every
// callback. We make zero assumptions about its layout — Swift never
// dereferences it.

import AppKit

public typealias VoidCallback = @convention(c) (UnsafeMutableRawPointer?) -> Void
public typealias BoolCallback = @convention(c) (UnsafeMutableRawPointer?, Bool) -> Void

@_cdecl("inmemnote_subscribe_mouse_up")
public func inmemnote_subscribe_mouse_up(_ cb: VoidCallback, _ ctx: UnsafeMutableRawPointer?) -> Bool {
  if mouseUp.isInstalled { return false }
  mouseUp.install(mask: .leftMouseUp, callback: cb, context: ctx)
  return true
}

@_cdecl("inmemnote_subscribe_mouse_down")
public func inmemnote_subscribe_mouse_down(_ cb: VoidCallback, _ ctx: UnsafeMutableRawPointer?) -> Bool {
  if mouseDown.isInstalled { return false }
  mouseDown.install(mask: .leftMouseDown, callback: cb, context: ctx)
  return true
}

/// `leftMouseDragged` only fires while the left button is held — keeps the
/// idle path zero-cost, which is the whole point of using this signal to
/// drive a custom resize.
@_cdecl("inmemnote_subscribe_mouse_drag")
public func inmemnote_subscribe_mouse_drag(_ cb: VoidCallback, _ ctx: UnsafeMutableRawPointer?) -> Bool {
  if mouseDrag.isInstalled { return false }
  mouseDrag.install(mask: .leftMouseDragged, callback: cb, context: ctx)
  return true
}

/// Attach a hover sensor to the top `headerHeight` strip of `contentViewPtr`.
///
/// `contentViewPtr` is the raw pointer Electron hands us via
/// `BrowserWindow.getNativeWindowHandle()` — on macOS, that's the content
/// `NSView` of the window. We bridge it as `takeUnretainedValue` because
/// the view is owned by Electron's window; Swift must NOT take ownership.
@_cdecl("inmemnote_install_header_hover")
public func inmemnote_install_header_hover(
  _ contentViewPtr: UnsafeMutableRawPointer,
  _ headerHeight: Double,
  _ cb: BoolCallback,
  _ ctx: UnsafeMutableRawPointer?
) -> Bool {
  if hoverView != nil { return false }
  let contentView = Unmanaged<NSView>.fromOpaque(contentViewPtr).takeUnretainedValue()

  // Anchor the sensor to the top edge of the parent. The autoresizing mask
  // depends on the parent's coordinate orientation: a flipped parent has
  // its origin at the top (anchor via `maxYMargin`); the standard AppKit
  // orientation has the origin at the bottom (anchor via `minYMargin`).
  // Either way the result is "glued to the top, stretches horizontally".
  let parentW = contentView.bounds.width
  let parentH = contentView.bounds.height
  let height = CGFloat(headerHeight)
  let frame: NSRect
  var mask: NSView.AutoresizingMask = [.width]
  if contentView.isFlipped {
    frame = NSRect(x: 0, y: 0, width: parentW, height: height)
    mask.insert(.maxYMargin)
  } else {
    frame = NSRect(x: 0, y: parentH - height, width: parentW, height: height)
    mask.insert(.minYMargin)
  }

  let view = HoverView(frame: frame)
  view.autoresizingMask = mask
  view.callback = cb
  view.context = ctx
  contentView.addSubview(view)
  hoverView = view
  return true
}

@_cdecl("inmemnote_remove_header_hover")
public func inmemnote_remove_header_hover() {
  hoverView?.removeFromSuperview()
  hoverView = nil
}

@_cdecl("inmemnote_unsubscribe_all")
public func inmemnote_unsubscribe_all() {
  mouseUp.tearDown()
  mouseDown.tearDown()
  mouseDrag.tearDown()
  hoverView?.removeFromSuperview()
  hoverView = nil
}
