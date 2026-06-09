import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useTranslation } from '@presentation/i18n/useTranslation';
import { useCallback, useEffect, useRef, useState } from 'react';


import { DraftFooter } from './DraftFooter';
import { DraftHeader } from './DraftHeader';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';
import { ResizeHandle } from './ResizeHandle';
import { draftActions } from './slice';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

/**
 * Top-level Draft panel.
 *
 * Wiring:
 *   - On mount and every "hotkey pressed" event from main, we call `open()`
 *     over IPC and write the result into Redux.
 *   - Local edits update Redux immediately so the UI stays responsive, and
 *     are flushed to disk via a debounced save (500ms idle).
 *   - Pin/close go directly through IPC; main is the source of truth for the
 *     BrowserWindow's always-on-top flag.
 *   - A ResizeObserver on the panel root drives `window.inmemnote.draft.resize`
 *     so the BrowserWindow shrinks/grows with the content.
 *
 * Pin/unpin transition:
 *   The native macOS resize animation runs at the BrowserWindow level (main
 *   calls `setBounds(..., true)`). Inside the renderer we only animate the
 *   things AppKit can't reach — the panel's CSS sizing tweaks (corner
 *   radius, max-height of the body). A custom `cubic-bezier(.22,.7,.3,1)`
 *   ease-out curve keeps that motion feeling continuous with the AppKit
 *   resize. We deliberately do NOT run a renderer-side FLIP morph — it
 *   would race the OS animation and produce the jittery look the user
 *   reported.
 */
export function DraftPanel(): JSX.Element {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.draft);
  const { t } = useTranslation();
  const saveTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Whether the user is currently dragging the pinned window by its header.
  // Drives the translucent drag overlay rendered over the panel.
  const [isDragging, setIsDragging] = useState(false);
  // The corner the pinned panel currently rests in. Drives ResizeHandle
  // placement: the handle goes on the diagonally OPPOSITE corner so the
  // user can only resize "away from the wall" the pin is anchored to.
  const [pinnedCorner, setPinnedCorner] = useState<Corner>('tr');
  // Main flips this to `true` while the user has dragged the corner
  // handle to a custom size. Body layout reacts: fill-the-window in
  // custom mode, content-fit with max-height in default mode.
  const [customSized, setCustomSized] = useState(false);

  const openFresh = useCallback(async () => {
    dispatch(draftActions.setLoading(true));
    const dto = await window.inmemnote.draft.open();
    dispatch(draftActions.setDraft(dto));
  }, [dispatch]);

  useEffect(() => {
    void openFresh();
    const unsub = window.inmemnote.draft.onHotkey(() => void openFresh());
    return unsub;
  }, [openFresh]);

  const flushSave = useCallback(
    async (id: string, content: string) => {
      try {
        const dto = await window.inmemnote.draft.save(id, content);
        dispatch(draftActions.setDraft(dto));
      } catch (e) {
        console.error('Draft save failed', e);
      }
    },
    [dispatch],
  );

  const onChange = useCallback(
    (next: string) => {
      dispatch(draftActions.editContent(next));
      if (!draft.id) return;
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        void flushSave(draft.id as string, next);
      }, 500);
    },
    [dispatch, draft.id, flushSave],
  );

  const onSubmit = useCallback(async () => {
    if (!draft.id) return;
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      await window.inmemnote.draft.save(draft.id, draft.content);
      await window.inmemnote.draft.promote(draft.id);
    } catch (e) {
      console.error('Draft promote failed', e);
    }
    dispatch(draftActions.clear());
    await window.inmemnote.draft.hide();
  }, [dispatch, draft.content, draft.id]);

  const onCancel = useCallback(async () => {
    if (!draft.id) {
      await window.inmemnote.draft.hide();
      return;
    }
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    await flushSave(draft.id, draft.content);
    await window.inmemnote.draft.close(draft.id);
    await window.inmemnote.draft.hide();
  }, [draft.content, draft.id, flushSave]);

  const onTogglePin = useCallback(async () => {
    if (!draft.id) return;
    // Flush the pending autosave first. Without this, main's TogglePin
    // use-case loads whatever the repo last persisted — which may be empty
    // if the user hit pin while the 500 ms debounce was still ticking — and
    // then sends that stale (empty) content back as the new draft DTO,
    // wiping the in-flight text on screen.
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      await window.inmemnote.draft.save(draft.id, draft.content);
    } catch (e) {
      console.error('Draft save before pin failed', e);
    }

    // Optimistically flip the local pinned flag and freeze the ResizeObserver
    // so the body relayouts to its new (pinned vs. full) constraints WITHOUT
    // bouncing height updates back to main. Then we measure the real final
    // panel height ourselves and pass it to main as the animation target —
    // that's what stops the two-step "land short, then re-snap" wobble.
    animatingRef.current = true;
    dispatch(
      draftActions.setDraft({
        id: draft.id,
        content: draft.content,
        pinned: !draft.pinned,
        updatedAt: draft.updatedAt ?? new Date().toISOString(),
      }),
    );

    // Wait two animation frames so React has committed and the browser has
    // finished a fresh layout pass on the new pinned-mode CSS.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );

    const targetHeight = Math.ceil(
      panelRef.current?.getBoundingClientRect().height ?? 0,
    );

    try {
      const dto = await window.inmemnote.draft.togglePin(draft.id, targetHeight);
      dispatch(draftActions.setDraft(dto));
    } catch (e) {
      console.error('Draft togglePin failed', e);
    }
  }, [dispatch, draft.id, draft.content, draft.pinned, draft.updatedAt]);

  // Window-level keymap fallback for ⌘↵/Esc.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        void onSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onSubmit, onCancel]);

  // Ref-flag toggled by `draft:animationStart` / `draft:animationDone`
  // broadcasts from main. While `true`, the ResizeObserver loop skips IPC —
  // those frames are owned by AppKit's animation pipeline and any extra
  // `setBounds` request from us would just fight it.
  const animatingRef = useRef(false);

  // ResizeObserver: report the panel's outer height up to main so the
  // BrowserWindow snaps tight around the content. Coalesce bursts into a
  // single rAF tick — otherwise rapid layout shifts produce a storm of IPC.
  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let frame: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (animatingRef.current) return;
      const entry = entries[0];
      if (!entry) return;
      if (frame !== null) cancelAnimationFrame(frame);
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      frame = requestAnimationFrame(() => {
        frame = null;
        void window.inmemnote.draft.resize(height);
      });
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);

  // Sync the pin corner from main: ask once for the current value, then
  // listen for changes so the ResizeHandle relocates after a drag-snap.
  useEffect(() => {
    void window.inmemnote.draft.getCorner().then(setPinnedCorner);
    return window.inmemnote.draft.onCornerChanged(setPinnedCorner);
  }, []);

  // Sync the "custom-sized" flag from main: drives body layout (fill the
  // window vs. fit content). Reset on unpin so the next pin starts in
  // auto mode regardless of what the previous session ended in.
  useEffect(() => {
    return window.inmemnote.draft.onCustomSizeChanged(setCustomSized);
  }, []);
  useEffect(() => {
    if (!draft.pinned) setCustomSized(false);
  }, [draft.pinned]);

  const onResetPinSize = useCallback(() => {
    void window.inmemnote.draft.resetPinSize();
  }, []);

  // Drag overlay state.
  //
  // The renderer can't observe `mousedown` on the header at all: with
  // `-webkit-app-region: drag` AppKit consumes the event before it reaches
  // any DOM listener (capture or bubble). The earliest reliable signal we
  // get is AppKit's first `move` callback, which main forwards to us as
  // `draft:dragStart` the same tick the drag actually begins. End signal
  // comes from the AppKit native mouse-up monitor.
  useEffect(() => {
    const offStart = window.inmemnote.draft.onDragStart(() => setIsDragging(true));
    const offEnd = window.inmemnote.draft.onDragEnd(() => setIsDragging(false));
    return () => {
      offStart();
      offEnd();
    };
  }, []);

  // Animation lifecycle handoff with main.
  useEffect(() => {
    const off1 = window.inmemnote.draft.onAnimationStart(() => {
      animatingRef.current = true;
    });
    const off2 = window.inmemnote.draft.onAnimationDone(() => {
      animatingRef.current = false;
      // Snap-after-drag and pin/unpin animations both terminate here.
      // Clearing `isDragging` keeps the blur overlay up through the entire
      // motion — from the moment the user grabs the header, through the
      // manual drag, through the snap easing — and removes it only once
      // the window has come to rest. Idempotent in the non-drag case.
      setIsDragging(false);
      // The window just landed at the animation target, which is a visual
      // approximation — push the real content-fit height now that the panel
      // has reflowed.
      const node = panelRef.current;
      if (!node) return;
      void window.inmemnote.draft.resize(Math.ceil(node.getBoundingClientRect().height));
    });
    return () => {
      off1();
      off2();
    };
  }, []);

  const pinned = draft.pinned;

  // Body layout values — split out so the constraints stay legible.
  //
  // Top/bottom paddings are deliberately IDENTICAL between modes: that's
  // what makes the editor content stay anchored relative to the body
  // boundary when the user pins/unpins. Horizontal padding shrinks a touch
  // in pinned mode to match the design's compact look.
  //
  // `minHeight` / `maxHeight` bracket the body. The wrapper panel itself
  // doesn't get a height — the renderer reports its actual size to main,
  // main clamps the OS window to a per-mode max, and `overflow-y: auto`
  // on the body kicks in once the content outgrows that cap.
  // Horizontal and vertical body paddings are identical in both modes —
  // changing only one of them would visually slide the content sideways
  // when the user pins/unpins. Mode differences live in width and
  // min/max-height only.
  const BODY_PAD_X = 24;
  const BODY_PAD_Y = 16;
  // Body layout splits along two axes:
  //
  //   1. un-pinned   — Spotlight-style: fit content, cap at `min(60vh, 560)`.
  //   2. pinned auto — same fit-content path, but no cap. The renderer's
  //                    ResizeObserver pushes the height up to main, which
  //                    in turn drives the BrowserWindow.
  //   3. pinned custom — body fills the window vertically. The window
  //                    height is locked to whatever the user dragged the
  //                    resize handle to; the editor expands to match.
  const usesFlexFill = pinned && customSized;
  const bodyMinHeight = usesFlexFill ? 0 : 96;
  const bodyMaxHeight = pinned ? undefined : 'min(60vh, 560px)';

  return (
    <div className="flex h-full w-full justify-center pt-0">
      {/* Panel fills the BrowserWindow it lives in. We used to anchor the
          panel at the top via `items-start`, but that left it sized to its
          content even when the OS window had been resized larger — the
          rest of the area below was empty. A simple `h-full` lets the
          panel match the window 1:1, and the body inside grows via
          `flex: 1` while the header and footer keep their natural sizes.

          No border / border-radius on purpose: layering CSS rounded corners
          on top of the frameless macOS window produced a visible double
          frame because the two corner radii were computed by different
          formulas. */}
      {/* `h-full` only in custom-sized mode: when the user has explicitly
          stretched the panel via the resize handle, the panel needs to
          fill the OS window so the body can grow with `flex: 1`. In every
          other state — un-pinned, or pinned without manual resize — the
          panel sizes to its content so the BrowserWindow can shrink-wrap
          via ResizeObserver. */}
      <div
        ref={panelRef}
        className={`bg-panel overflow-hidden w-full flex flex-col relative ${
          usesFlexFill ? 'h-full' : ''
        }`}
      >
        {/* Drag overlay — covers the entire pinned panel while AppKit moves
            the window. Blurs the underlying content so the user gets a clear
            "I'm carrying this around" cue without obscuring the panel
            entirely. Rendered conditionally (no CSS transition) so the
            effect snaps on and off in lockstep with the mouse gesture.
            `pointer-events: none` lets the underlying drag region keep
            receiving the AppKit move stream. */}
        {isDragging && (
          <div
            aria-hidden="true"
            // Starts BELOW the 60px header + 1px divider so the header stays
            // crisp during a drag — it's the thing the user is grabbing, so
            // muting it would visually contradict the gesture.
            className="absolute left-0 right-0 bottom-0 top-[61px] pointer-events-none"
            style={{
              // Subtle hint of motion — just enough to read as "I picked
              // this up" without obscuring the panel content. Heavy blur
              // (14px+) felt overwhelming during a quick drag.
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              background: 'rgba(0, 0, 0, 0.02)',
              zIndex: 50,
            }}
          />
        )}
        <DraftHeader
          pinned={pinned}
          onTogglePin={onTogglePin}
          onResetPinSize={customSized ? onResetPinSize : undefined}
        />
        {pinned && <ResizeHandle pinnedCorner={pinnedCorner} />}
        <div className="h-px bg-line" />
        <div
          className="draft-no-drag overflow-y-auto"
          style={{
            paddingTop: BODY_PAD_Y,
            paddingBottom: BODY_PAD_Y,
            paddingLeft: BODY_PAD_X,
            paddingRight: BODY_PAD_X,
            flex: usesFlexFill ? 1 : undefined,
            minHeight: bodyMinHeight,
            maxHeight: bodyMaxHeight,
          }}
        >
          <CodeMirrorEditor
            value={draft.content}
            placeholder={t('draft.placeholder')}
            onChange={onChange}
            onSubmit={onSubmit}
            onCancel={onCancel}
            autoFocus
          />
        </div>
        {/* Footer stays in BOTH modes. Dropping it in pinned mode used to
            change the vertical structure mid-animation, which read as the
            content "jumping" while the window resized. */}
        <DraftFooter />
      </div>
    </div>
  );
}
