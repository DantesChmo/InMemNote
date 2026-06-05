import { useAppDispatch, useAppSelector } from '@presentation/app/store';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';


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
 *   - Pin/unpin triggers a FLIP morph (capture rect → swap layout → animate
 *     transform back to identity).
 */
export function DraftPanel(): JSX.Element {
  const dispatch = useAppDispatch();
  const draft = useAppSelector((s) => s.draft);
  const saveTimer = useRef<number | null>(null);

  // DOM handle for ResizeObserver + FLIP.
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Cached "before" rect from the click that toggled pin; consumed once.
  const flipFromRect = useRef<DOMRect | null>(null);
  // Suspended while an animation is in flight: we don't want ResizeObserver
  // mid-morph to fight the running window resize.
  const morphInFlight = useRef(false);
  // Echo state of `pinned` so layout-effect knows whether the swap happened.
  const lastPinned = useRef<boolean>(draft.pinned);

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
        // Soft-fail: a save error is recoverable on next edit. Logged for
        // diagnostics; in production we'd surface a subtle UI hint.
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
    // Cancel any pending autosave — `promote` consumes the scratch slot and
    // a debounced save firing afterwards would `SaveDraft` against a now-
    // missing draft id, producing a noisy IPC error.
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      // Persist the very latest keystrokes (debounce may not have fired yet)
      // and then move them into the library as a new Note.
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
    // Drop the throttled save and persist the latest text before hiding —
    // otherwise the last keystrokes before Esc would be lost.
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    await flushSave(draft.id, draft.content);
    await window.inmemnote.draft.close(draft.id);
    await window.inmemnote.draft.hide();
  }, [draft.content, draft.id, flushSave]);

  const onTogglePin = useCallback(async () => {
    if (!draft.id) return;
    // FLIP — step 1 ("First"): capture the rect BEFORE the layout swap so we
    // can interpolate from there in the layout-effect after the rerender.
    if (panelRef.current) {
      flipFromRect.current = panelRef.current.getBoundingClientRect();
      morphInFlight.current = true;
    }
    const dto = await window.inmemnote.draft.togglePin(draft.id);
    dispatch(draftActions.setDraft(dto));
  }, [dispatch, draft.id]);

  // Window-level keymap fallback. The CodeMirror keymap covers ⌘↵/Esc as long
  // as the editable surface holds the caret, but a stray click on the panel
  // chrome can move focus to the BrowserWindow body, where CM bindings don't
  // fire. Listening on `document` ensures the shortcut always works while the
  // overlay is visible.
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

  // FLIP — steps 2-4 ("Last" / "Invert" / "Play"). Runs after React has
  // committed the new layout (pinned → full or vice versa).
  useLayoutEffect(() => {
    if (draft.pinned === lastPinned.current) return; // nothing to morph
    lastPinned.current = draft.pinned;

    const node = panelRef.current;
    const from = flipFromRect.current;
    flipFromRect.current = null;
    if (!node || !from) return;

    const to = node.getBoundingClientRect();
    if (to.width === 0 || to.height === 0) return;

    const dx = from.left - to.left;
    const dy = from.top - to.top;
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) {
      morphInFlight.current = false;
      return;
    }

    const anim = node.animate(
      [{ transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }, { transform: 'none' }],
      { duration: 360, easing: 'cubic-bezier(.22,.7,.3,1)', fill: 'both' },
    );
    anim.onfinish = () => {
      morphInFlight.current = false;
    };
  }, [draft.pinned]);

  // ResizeObserver: keep the Electron window snug around the panel. We only
  // fire when not morphing — mid-animation the panel transitions through
  // intermediate sizes that should NOT propagate to the OS window.
  useEffect(() => {
    const node = panelRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    let frame: number | null = null;
    const ro = new ResizeObserver((entries) => {
      if (morphInFlight.current) return;
      const entry = entries[0];
      if (!entry) return;
      // Coalesce bursts of measurements into one IPC call per animation frame —
      // ResizeObserver can fire many times during list-item growth.
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

  const pinned = draft.pinned;

  return (
    <div className="flex h-full w-full items-start justify-center pt-0">
      <div
        ref={panelRef}
        className={`bg-panel border border-line shadow-panel transform-gpu ${
          pinned ? 'w-pin-panel rounded-pin' : 'w-draft-panel rounded-panel'
        }`}
        style={{ transformOrigin: 'top left' }}
      >
        <DraftHeader pinned={pinned} onTogglePin={onTogglePin} />
        <div className="h-px bg-line" />
        <div
          className={`draft-no-drag ${
            pinned ? 'px-[14px] pt-[10px] pb-[14px] max-h-[180px]' : 'px-6 pt-5 pb-6 min-h-[96px]'
          } overflow-y-auto`}
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
        {!pinned && <DraftFooter />}
      </div>
    </div>
  );
}
