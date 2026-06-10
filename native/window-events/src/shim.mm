// N-API shim for Inmemnote's AppKit hooks.
//
// All the AppKit work — NSEvent monitors, NSTrackingArea, the hover view —
// lives on the Swift side (Sources/WindowEventsCore/), reached through the
// C ABI declared in InmemnoteBridge.h. This file's only job is the
// node-addon-api side: type-check JS arguments, own the lifecycle of
// `Napi::ThreadSafeFunction`s, and trampoline Swift's C callbacks back into
// JS via those TSFNs.
//
// Why two layers: N-API is a C ABI, so the entry point has to be C/C++.
// Putting the AppKit body in Swift gives us safer memory semantics for the
// monitor/tracking-area lifecycles; putting the N-API surface in C++ keeps
// node-gyp happy without bending the build toward swiftpm-as-primary.

#include <napi.h>
#include "InmemnoteBridge.h"

namespace {

// One TSFN per signal. Owned globally because both the N-API surface and
// the Swift-side monitor live for the lifetime of the process — there is
// no per-window scope to attach them to.
struct Subscription {
  Napi::ThreadSafeFunction tsfn;
};

Subscription g_mouseUp;
Subscription g_mouseDown;
Subscription g_mouseDrag;
Subscription g_headerHover;

// C trampolines handed to Swift. `ctx` is the address of the Subscription
// above — Swift never dereferences it, just hands it back here.
void OnVoidEvent(void* ctx) {
  auto* sub = static_cast<Subscription*>(ctx);
  if (sub && sub->tsfn) sub->tsfn.NonBlockingCall();
}

void OnBoolEvent(void* ctx, bool entered) {
  auto* sub = static_cast<Subscription*>(ctx);
  if (!sub || !sub->tsfn) return;
  // Heap-allocate the payload because `NonBlockingCall` is asynchronous —
  // the value must outlive this stack frame. The JS-side lambda owns it
  // and deletes after the call.
  bool* payload = new bool(entered);
  sub->tsfn.NonBlockingCall(
      payload,
      [](Napi::Env env, Napi::Function jsCallback, bool* data) {
        jsCallback.Call({Napi::Boolean::New(env, *data)});
        delete data;
      });
}

// Shared body for the three void subscribe entry points. `installer` is
// the Swift @_cdecl function to call once we've created the TSFN.
Napi::Value SubscribeVoid(const Napi::CallbackInfo& info,
                          Subscription& sub,
                          const char* resourceName,
                          bool (*installer)(InmemnoteVoidCallback, void*)) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsFunction()) {
    Napi::TypeError::New(env, "subscribe(callback) requires a function")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  if (sub.tsfn) {
    // TSFN already alive; Swift will refuse to double-install too.
    return env.Undefined();
  }
  Napi::Function callback = info[0].As<Napi::Function>();
  sub.tsfn = Napi::ThreadSafeFunction::New(env, callback, resourceName, 0, 1);
  if (!installer(&OnVoidEvent, &sub)) {
    // Swift was already installed — release the TSFN we just made to keep
    // the no-op truly free.
    sub.tsfn.Release();
    sub.tsfn = Napi::ThreadSafeFunction();
  }
  return env.Undefined();
}

Napi::Value SubscribeToMouseUp(const Napi::CallbackInfo& info) {
  return SubscribeVoid(info, g_mouseUp, "InmemnoteMouseUp",
                       &inmemnote_subscribe_mouse_up);
}

Napi::Value SubscribeToMouseDown(const Napi::CallbackInfo& info) {
  return SubscribeVoid(info, g_mouseDown, "InmemnoteMouseDown",
                       &inmemnote_subscribe_mouse_down);
}

Napi::Value SubscribeToMouseDrag(const Napi::CallbackInfo& info) {
  return SubscribeVoid(info, g_mouseDrag, "InmemnoteMouseDrag",
                       &inmemnote_subscribe_mouse_drag);
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
  if (g_headerHover.tsfn) {
    return env.Undefined();
  }

  Napi::Buffer<unsigned char> handleBuf =
      info[0].As<Napi::Buffer<unsigned char>>();
  if (handleBuf.Length() < sizeof(void*)) {
    Napi::Error::New(env, "windowHandle buffer too small")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  void* contentView = *reinterpret_cast<void**>(handleBuf.Data());
  if (contentView == nullptr) return env.Undefined();

  double headerHeight = info[1].As<Napi::Number>().DoubleValue();
  Napi::Function cb = info[2].As<Napi::Function>();

  g_headerHover.tsfn = Napi::ThreadSafeFunction::New(
      env, cb, "InmemnoteHeaderHover", 0, 1);

  if (!inmemnote_install_header_hover(contentView, headerHeight,
                                      &OnBoolEvent, &g_headerHover)) {
    g_headerHover.tsfn.Release();
    g_headerHover.tsfn = Napi::ThreadSafeFunction();
  }
  return env.Undefined();
}

Napi::Value RemoveHeaderHoverTracker(const Napi::CallbackInfo& info) {
  inmemnote_remove_header_hover();
  if (g_headerHover.tsfn) {
    g_headerHover.tsfn.Release();
    g_headerHover.tsfn = Napi::ThreadSafeFunction();
  }
  return info.Env().Undefined();
}

Napi::Value Unsubscribe(const Napi::CallbackInfo& info) {
  inmemnote_unsubscribe_all();
  for (Subscription* sub : {&g_mouseUp, &g_mouseDown, &g_mouseDrag, &g_headerHover}) {
    if (sub->tsfn) {
      sub->tsfn.Release();
      sub->tsfn = Napi::ThreadSafeFunction();
    }
  }
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
