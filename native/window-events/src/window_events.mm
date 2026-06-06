// AppKit hooks for Inmemnote.
//
// We expose one synchronous trigger: a left-mouse-up signal. The Draft window
// uses macOS's built-in window drag (`-webkit-app-region: drag` → AppKit's
// `mouseDownCanMoveWindow`), so we don't fight AppKit for the move events
// themselves. What we DO need is the moment the user releases the mouse
// button — that's when we want to snap the pinned overlay into its corner.
// Electron's `BrowserWindow` doesn't surface that event, so we register a
// global `NSEvent` monitor here and bridge it back to JS via a
// `ThreadSafeFunction`.
//
// `NSEvent.addGlobalMonitorForEventsMatchingMask` watches events delivered
// to other applications. We pair it with a local monitor that fires when the
// release happens inside our own process. Together they catch every release,
// regardless of whether the cursor is currently over our window — which is
// exactly the case during a drag that runs past the window's bounds.

#include <napi.h>
#import <Cocoa/Cocoa.h>

namespace {

// Both monitors run on the main thread; the TSFN bridges back to V8.
id g_globalMonitor = nil;
id g_localMonitor = nil;
Napi::ThreadSafeFunction g_tsfn;

void Cleanup() {
  if (g_globalMonitor != nil) {
    [NSEvent removeMonitor:g_globalMonitor];
    g_globalMonitor = nil;
  }
  if (g_localMonitor != nil) {
    [NSEvent removeMonitor:g_localMonitor];
    g_localMonitor = nil;
  }
  if (g_tsfn) {
    g_tsfn.Release();
    g_tsfn = Napi::ThreadSafeFunction();
  }
}

Napi::Value SubscribeToMouseUp(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "subscribeToMouseUp(callback) requires a function")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  // Idempotent: subscribing twice without unsubscribing first is a no-op.
  if (g_globalMonitor != nil || g_localMonitor != nil) {
    return env.Undefined();
  }

  Napi::Function callback = info[0].As<Napi::Function>();
  g_tsfn = Napi::ThreadSafeFunction::New(
    env,
    callback,
    "InmemnoteMouseUp",
    /* maxQueueSize */ 0,
    /* initialThreadCount */ 1
  );

  // Block fires for every release we see; the TSFN hops back to the main JS
  // thread so the callback runs in V8 context.
  auto handler = ^(NSEvent* /*event*/) {
    g_tsfn.NonBlockingCall();
  };

  g_globalMonitor = [NSEvent
    addGlobalMonitorForEventsMatchingMask:NSEventMaskLeftMouseUp
                                  handler:handler];
  // The local monitor MUST return the event so AppKit keeps delivering it
  // to whatever target it was originally headed for (text fields, buttons,
  // …). Returning nil would eat the click.
  g_localMonitor = [NSEvent
    addLocalMonitorForEventsMatchingMask:NSEventMaskLeftMouseUp
                                 handler:^NSEvent*(NSEvent* event) {
                                   g_tsfn.NonBlockingCall();
                                   return event;
                                 }];
  return env.Undefined();
}

Napi::Value Unsubscribe(const Napi::CallbackInfo& info) {
  Cleanup();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("subscribeToMouseUp",
              Napi::Function::New(env, SubscribeToMouseUp));
  exports.Set("unsubscribe",
              Napi::Function::New(env, Unsubscribe));
  return exports;
}

}  // namespace

NODE_API_MODULE(window_events, Init)
