// C ABI that the WindowEventsCore Swift static library exposes.
//
// Every prototype here MUST match an `@_cdecl` symbol in
// `Sources/WindowEventsCore/Bridge.swift`. The shim in `shim.mm` imports
// this header and treats Swift as a black box: it owns no AppKit state,
// only marshals between N-API callbacks and the C trampolines below.
#ifndef INMEMNOTE_BRIDGE_H
#define INMEMNOTE_BRIDGE_H

#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef void (*InmemnoteVoidCallback)(void* ctx);
typedef void (*InmemnoteBoolCallback)(void* ctx, bool entered);

// All three return `true` if monitors were freshly installed, `false` if
// they were already in place (idempotent no-op). Idempotency lives on the
// Swift side; the shim relies on it to avoid leaking ThreadSafeFunctions.
bool inmemnote_subscribe_mouse_up(InmemnoteVoidCallback cb, void* ctx);
bool inmemnote_subscribe_mouse_down(InmemnoteVoidCallback cb, void* ctx);
bool inmemnote_subscribe_mouse_drag(InmemnoteVoidCallback cb, void* ctx);

// `contentView` is the raw NSView* Electron returns from
// `BrowserWindow.getNativeWindowHandle()` on macOS. Same idempotency rule:
// returns `false` if a tracker is already installed.
bool inmemnote_install_header_hover(void* contentView,
                                    double headerHeight,
                                    InmemnoteBoolCallback cb,
                                    void* ctx);

void inmemnote_remove_header_hover(void);

void inmemnote_unsubscribe_all(void);

#ifdef __cplusplus
}
#endif

#endif  // INMEMNOTE_BRIDGE_H
