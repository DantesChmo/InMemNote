import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useCallback, useEffect, useRef, useState } from 'react';


import { DraftFooter } from './DraftFooter';
import { DraftHeader } from './DraftHeader';
import { CodeMirrorEditor } from './editor/CodeMirrorEditor';
import { draftActions } from './slice';

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
  const saveTimer = useRef<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Whether the user is currently dragging the pinned window by its header.
  // Drives the translucent drag overlay rendered over the panel.
  const [isDragging, setIsDragging] = useState(false);

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

  // Drag lifecycle from main. We don't drive the move itself — AppKit owns
  // that via the header's `-webkit-app-region: drag`. We only mirror the
  // start/end into local state so the overlay can fade in and out.
  useEffect(() => {
    const off1 = window.inmemnote.draft.onDragStart(() => setIsDragging(true));
    const off2 = window.inmemnote.draft.onDragEnd(() => setIsDragging(false));
    return () => {
      off1();
      off2();
    };
  }, []);

  // Animation lifecycle handoff with main.
  useEffect(() => {
    const off1 = window.inmemnote.draft.onAnimationStart(() => {
      animatingRef.current = true;
    });
    const off2 = window.inmemnote.draft.onAnimationDone(() => {
      animatingRef.current = false;
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
  const bodyMinHeight = pinned ? 80 : 96;
  const bodyMaxHeight = pinned ? 240 : 'min(60vh, 560px)';

  return (
    <div className="flex h-full w-full items-start justify-center pt-0">
      <div
        ref={panelRef}
        className="bg-panel border border-line shadow-panel overflow-hidden w-full flex flex-col relative"
        style={{ borderRadius: pinned ? 14 : 16 }}
      >
        {/* Drag overlay — covers the entire pinned panel while AppKit moves
            the window. Click events fall through to the dragged window (no
            interactive content underneath) thanks to `pointer-events: none`.
            Fades in/out so the appearance doesn't snap. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none transition-opacity duration-150"
          style={{
            opacity: isDragging ? 1 : 0,
            background: 'var(--accent-tint)',
            zIndex: 50,
          }}
        />
        <DraftHeader pinned={pinned} onTogglePin={onTogglePin} />
        <div className="h-px bg-line" />
        <div
          className="draft-no-drag overflow-y-auto"
          style={{
            paddingTop: BODY_PAD_Y,
            paddingBottom: BODY_PAD_Y,
            paddingLeft: BODY_PAD_X,
            paddingRight: BODY_PAD_X,
            minHeight: bodyMinHeight,
            maxHeight: bodyMaxHeight,
          }}
        >
          <CodeMirrorEditor
            value={draft.content}
            placeholder="Начни писать…"
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
