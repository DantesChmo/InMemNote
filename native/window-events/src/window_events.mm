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
// Both subscriptions install a pair of `NSEvent` monitors — global +
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

Napi::Value Unsubscribe(const Napi::CallbackInfo& info) {
  TearDown(g_mouseUp);
  TearDown(g_mouseDown);
  TearDown(g_mouseDrag);
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("subscribeToMouseUp", Napi::Function::New(env, SubscribeToMouseUp));
  exports.Set("subscribeToMouseDown",
              Napi::Function::New(env, SubscribeToMouseDown));
  exports.Set("subscribeToMouseDrag",
              Napi::Function::New(env, SubscribeToMouseDrag));
  exports.Set("unsubscribe", Napi::Function::New(env, Unsubscribe));
  return exports;
}

}  // namespace

NODE_API_MODULE(window_events, Init)
