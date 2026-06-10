import AppKit

/// One pair of NSEvent monitors (global + local) wired to a single C callback.
///
/// The `global` monitor fires for events delivered to other applications;
/// the `local` monitor fires for events delivered to ours and MUST return
/// the event unchanged so AppKit keeps routing it to its original target
/// (buttons, text fields, the window's drag region, …).
final class Subscription {
  private var globalMonitor: Any?
  private var localMonitor: Any?
  private var callback: VoidCallback?
  private var context: UnsafeMutableRawPointer?

  var isInstalled: Bool { globalMonitor != nil || localMonitor != nil }

  func install(mask: NSEvent.EventTypeMask, callback: @escaping VoidCallback, context: UnsafeMutableRawPointer?) {
    self.callback = callback
    self.context = context
    let fire: () -> Void = { [weak self] in
      guard let self, let cb = self.callback else { return }
      cb(self.context)
    }
    globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: mask) { _ in fire() }
    localMonitor = NSEvent.addLocalMonitorForEvents(matching: mask) { event in
      fire()
      return event
    }
  }

  func tearDown() {
    if let g = globalMonitor { NSEvent.removeMonitor(g); globalMonitor = nil }
    if let l = localMonitor { NSEvent.removeMonitor(l); localMonitor = nil }
    callback = nil
    context = nil
  }
}

let mouseUp = Subscription()
let mouseDown = Subscription()
let mouseDrag = Subscription()
