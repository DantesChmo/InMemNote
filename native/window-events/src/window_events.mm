// AppKit hooks for Inmemnote.
//
// We expose synchronous triggers for the two pieces of mouse state that
// Electron's `BrowserWindow` doesn't surface on its own:
//
//   - `subscribeToMouseDown` — fires the instant the user presses the left
//     mouse button. We need this because `-webkit-app-region: drag` over
//     the window header makes AppKit swallow `mousedown` before any DOM /
//     React handler in the renderer can see it; without a native hook the
//     earliest signal we'd get is the first `move` event, which only
//     arrives once the cursor has actually moved a pixel.
//
//   - `subscribeToMouseUp` — symmetric: fires the moment the button is
//     released. We need it because the Draft window uses AppKit's
//     `mouseDownCanMoveWindow` for the actual move; once the drag carries
//     the cursor outside our window's bounds, no DOM `mouseup` ever
//     reaches the renderer.
//
//   - `installHeaderHoverTracker` — attaches an `NSTrackingArea` to a
//     subview pinned over the top header strip of the Draft window so we
//     get `mouseEntered`/`mouseExited` callbacks without a global cursor
//     monitor. CSS `:hover` does not fire on `-webkit-app-region: drag`
//     elements, so this is the only way to observe hover over the header.
//     Subview returns `nil` from `hitTest:` so it never consumes a real
//     mouse event — it's pure sensor.
//
// All event subscriptions install a pair of `NSEvent` monitors — global +
// local — and bridge their callbacks back to JS through a
// `ThreadSafeFunction`. The local monitor MUST return the event unchanged
// so AppKit keeps routing it to its original target (buttons, text
// fields, …).

#include <napi.h>
#import <Cocoa/Cocoa.h>

namespace {

struct Subscription {
  id globalMonitor = nil;
  id localMonitor = nil;
  Napi::ThreadSafeFunction tsfn;
};

Subscription g_mouseUp;
Subscription g_mouseDown;
Subscription g_mouseDrag;
Subscription g_headerHover;

void TearDown(Subscription& sub) {
  if (sub.globalMonitor != nil) {
    [NSEvent removeMonitor:sub.globalMonitor];
    sub.globalMonitor = nil;
  }
  if (sub.localMonitor != nil) {
    [NSEvent removeMonitor:sub.localMonitor];
    sub.localMonitor = nil;
  }
  if (sub.tsfn) {
    sub.tsfn.Release();
    sub.tsfn = Napi::ThreadSafeFunction();
  }
}

void InstallMonitors(Subscription& sub, NSEventMask mask) {
  auto fire = ^{ sub.tsfn.NonBlockingCall(); };
  sub.globalMonitor = [NSEvent
    addGlobalMonitorForEventsMatchingMask:mask
                                  handler:^(NSEvent* /*event*/) { fire(); }];
  sub.localMonitor = [NSEvent
    addLocalMonitorForEventsMatchingMask:mask
                                 handler:^NSEvent*(NSEvent* event) {
                                   fire();
                                   return event;
                                 }];
}

}  // namespace

// Forward decl so the @interface can use it.
static void FireHeaderHover(bool entered);

@interface InmemnoteHoverView : NSView
@end

@implementation InmemnoteHoverView {
  NSTrackingArea* _trackingArea;
}

// Called by AppKit whenever the view's geometry changes (which, with our
// `autoresizingMask`, happens automatically when the window resizes). We
// drop the old tracking area and install a fresh one covering the current
// bounds — `NSTrackingInVisibleRect` keeps the rect in sync without
// further intervention, but rebuilding here is the idiomatic AppKit
// pattern.
- (void)updateTrackingAreas {
  [super updateTrackingAreas];
  if (_trackingArea != nil) {
    [self removeTrackingArea:_trackingArea];
    _trackingArea = nil;
  }
  _trackingArea = [[NSTrackingArea alloc]
      initWithRect:self.bounds
           options:(NSTrackingMouseEnteredAndExited |
                    NSTrackingActiveAlways |
                    NSTrackingInVisibleRect)
             owner:self
          userInfo:nil];
  [self addTrackingArea:_trackingArea];
}

- (void)mouseEntered:(NSEvent*)event {
  FireHeaderHover(true);
}

- (void)mouseExited:(NSEvent*)event {
  FireHeaderHover(false);
}

// Crucial: this view exists ONLY to host the tracking area. Returning nil
// from hit-testing makes it transparent to mouse events, so the real
// targets (window drag region, pin button, resize handle, …) still
// receive their clicks. Without this, the view would swallow every
// mousedown over the header.
- (NSView*)hitTest:(NSPoint)point {
  return nil;
}

@end

namespace {
// ARC keeps the view alive through this strong reference. We null it out
// in RemoveHeaderHoverTracker after `removeFromSuperview`.
InmemnoteHoverView* g_hoverView = nil;
}  // namespace

static void FireHeaderHover(bool entered) {
  if (!g_headerHover.tsfn) return;
  bool* payload = new bool(entered);
  g_headerHover.tsfn.NonBlockingCall(
      payload,
      [](Napi::Env env, Napi::Function jsCallback, bool* data) {
        jsCallback.Call({Napi::Boolean::New(env, *data)});
        delete data;
      });
}

namespace {

Napi::Value SubscribeToMouseUp(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "subscribeToMouseUp(callback) requires a function")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_mouseUp.globalMonitor != nil || g_mouseUp.localMonitor != nil) {
    return env.Undefined();
  }
  Napi::Function callback = info[0].As<Napi::Function>();
  g_mouseUp.tsfn = Napi::ThreadSafeFunction::New(
    env, callback, "InmemnoteMouseUp", 0, 1);
  InstallMonitors(g_mouseUp, NSEventMaskLeftMouseUp);
  return env.Undefined();
}

Napi::Value SubscribeToMouseDown(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "subscribeToMouseDown(callback) requires a function")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_mouseDown.globalMonitor != nil || g_mouseDown.localMonitor != nil) {
    return env.Undefined();
  }
  Napi::Function callback = info[0].As<Napi::Function>();
  g_mouseDown.tsfn = Napi::ThreadSafeFunction::New(
    env, callback, "InmemnoteMouseDown", 0, 1);
  InstallMonitors(g_mouseDown, NSEventMaskLeftMouseDown);
  return env.Undefined();
}

Napi::Value SubscribeToMouseDrag(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "subscribeToMouseDrag(callback) requires a function")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_mouseDrag.globalMonitor != nil || g_mouseDrag.localMonitor != nil) {
    return env.Undefined();
  }
  Napi::Function callback = info[0].As<Napi::Function>();
  g_mouseDrag.tsfn = Napi::ThreadSafeFunction::New(
    env, callback, "InmemnoteMouseDrag", 0, 1);
  // `NSEventMaskLeftMouseDragged` only fires while the left button is held
  // down — exactly the window we want for "drive a custom resize from the
  // global cursor stream", with no events polluting the idle case.
  InstallMonitors(g_mouseDrag, NSEventMaskLeftMouseDragged);
  return env.Undefined();
}

Napi::Value InstallHeaderHoverTracker(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 3 || !info[0].IsBuffer() || !info[1].IsNumber() ||
      !info[2].IsFunction()) {
    Napi::TypeError::New(
        env,
        "installHeaderHoverTracker(windowHandle, headerHeight, callback)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (g_hoverView != nil) {
    // Idempotent: a second call before remove is a no-op.
    return env.Undefined();
  }

  Napi::Buffer<unsigned char> handleBuf =
      info[0].As<Napi::Buffer<unsigned char>>();
  if (handleBuf.Length() < sizeof(void*)) {
    Napi::Error::New(env, "windowHandle buffer too small")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  // Electron's `BrowserWindow.getNativeWindowHandle()` returns a Buffer
  // containing a pointer to the NSView that backs the window's content
  // area. That's exactly the view we want to host the tracking subview on.
  // Bridge from the raw C pointer Electron handed us into an ARC-managed
  // NSView reference. We `__bridge` because the view is owned by Electron's
  // window — ARC must NOT take ownership of it.
  void* raw = *reinterpret_cast<void**>(handleBuf.Data());
  NSView* contentView = (__bridge NSView*)raw;
  if (contentView == nil) return env.Undefined();

  CGFloat headerHeight = info[1].As<Napi::Number>().DoubleValue();
  Napi::Function cb = info[2].As<Napi::Function>();

  g_headerHover.tsfn = Napi::ThreadSafeFunction::New(
      env, cb, "InmemnoteHeaderHover", 0, 1);

  // Position the sensor over the top strip of the content view. We branch
  // on `isFlipped` because the autoresizing mask depends on the parent's
  // coordinate orientation: a flipped parent has the origin at the top, so
  // we anchor via `MaxYMargin`; the standard AppKit orientation has it at
  // the bottom, so we anchor via `MinYMargin`. Either way the result is
  // "stay glued to the top edge, stretch horizontally with the window".
  CGFloat parentW = contentView.bounds.size.width;
  CGFloat parentH = contentView.bounds.size.height;
  NSRect frame;
  NSAutoresizingMaskOptions mask = NSViewWidthSizable;
  if (contentView.isFlipped) {
    frame = NSMakeRect(0, 0, parentW, headerHeight);
    mask |= NSViewMaxYMargin;
  } else {
    frame = NSMakeRect(0, parentH - headerHeight, parentW, headerHeight);
    mask |= NSViewMinYMargin;
  }

  g_hoverView = [[InmemnoteHoverView alloc] initWithFrame:frame];
  g_hoverView.autoresizingMask = mask;
  [contentView addSubview:g_hoverView];
  return env.Undefined();
}

Napi::Value RemoveHeaderHoverTracker(const Napi::CallbackInfo& info) {
  if (g_hoverView != nil) {
    [g_hoverView removeFromSuperview];
    g_hoverView = nil;
  }
  TearDown(g_headerHover);
  return info.Env().Undefined();
}

Napi::Value Unsubscribe(const Napi::CallbackInfo& info) {
  TearDown(g_mouseUp);
  TearDown(g_mouseDown);
  TearDown(g_mouseDrag);
  if (g_hoverView != nil) {
    [g_hoverView removeFromSuperview];
    g_hoverView = nil;
  }
  TearDown(g_headerHover);
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("subscribeToMouseUp", Napi::Function::New(env, SubscribeToMouseUp));
  exports.Set("subscribeToMouseDown",
              Napi::Function::New(env, SubscribeToMouseDown));
  exports.Set("subscribeToMouseDrag",
              Napi::Function::New(env, SubscribeToMouseDrag));
  exports.Set("installHeaderHoverTracker",
              Napi::Function::New(env, InstallHeaderHoverTracker));
  exports.Set("removeHeaderHoverTracker",
              Napi::Function::New(env, RemoveHeaderHoverTracker));
  exports.Set("unsubscribe", Napi::Function::New(env, Unsubscribe));
  return exports;
}

}  // namespace

NODE_API_MODULE(window_events, Init)
