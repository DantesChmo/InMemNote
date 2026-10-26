# Inmemnote — E2E regression test plan

> Auto-generated from JSDoc in `e2e/**/*.spec.ts`.
> Do NOT edit by hand — run `npm run gen:test-plan` to refresh.
> CI fails if this file is out of sync with the source specs.

## Summary

- Total scenarios: **121**
- By priority: **P0** = 41, **P1** = 65, **P2** = 15
- By type: **positive** = 56, **negative** = 22, **edge** = 11, **race** = 13, **persistence** = 19
- By area: **Cross-window** = 17, **Draft** = 34, **Library** = 48, **Settings** = 21, **Visual** = 1

## Table of contents

- [Draft](#draft)
  - [Autosave](#draft-autosave) (1)
  - [Cancel / Hide](#draft-cancel-hide) (1)
  - [Editor / CodeMirror](#draft-editor-codemirror) (1)
  - [Editor / Persistence](#draft-editor-persistence) (1)
  - [Encoding](#draft-encoding) (1)
  - [Focus / Blur](#draft-focus-blur) (1)
  - [Markdown rendering / Headings](#draft-markdown-rendering-headings) (3)
  - [Markdown rendering / Lists](#draft-markdown-rendering-lists) (2)
  - [Markdown rendering / Lists & Quotes](#draft-markdown-rendering-lists-quotes) (1)
  - [Persistence](#draft-persistence) (2)
  - [Pin / AlwaysOnTop](#draft-pin-alwaysontop) (2)
  - [Pin / Anchor](#draft-pin-anchor) (2)
  - [Pin / Cancel](#draft-pin-cancel) (1)
  - [Pin / Drag-to-corner](#draft-pin-drag-to-corner) (1)
  - [Pin / Manual resize](#draft-pin-manual-resize) (5)
  - [Pin / Window geometry](#draft-pin-window-geometry) (3)
  - [Positioning](#draft-positioning) (1)
  - [Promote](#draft-promote) (1)
  - [Security / Screen capture](#draft-security-screen-capture) (1)
  - [Summon](#draft-summon) (1)
  - [Window lifecycle](#draft-window-lifecycle) (2)
- [Library](#library)
  - [Autosave / Debounce](#library-autosave-debounce) (1)
  - [Autosave / Note switch](#library-autosave-note-switch) (1)
  - [Autosave / Quit](#library-autosave-quit) (1)
  - [Autosave / Window close](#library-autosave-window-close) (1)
  - [Autosave / ⌘↵ (bug #06)](#library-autosave-bug-06) (1)
  - [CRUD](#library-crud) (1)
  - [Create / Race](#library-create-race) (1)
  - [Create / Untitled](#library-create-untitled) (1)
  - [Delete](#library-delete) (1)
  - [Delete / Empty state](#library-delete-empty-state) (1)
  - [Filter](#library-filter) (1)
  - [Persistence](#library-persistence) (1)
  - [Persistence / Large content](#library-persistence-large-content) (1)
  - [Pin](#library-pin) (1)
  - [Pin / Filter](#library-pin-filter) (1)
  - [Pin / Ordering](#library-pin-ordering) (2)
  - [Pin / Persistence](#library-pin-persistence) (1)
  - [Pin / Race](#library-pin-race) (1)
  - [Search](#library-search) (1)
  - [Search / Body match](#library-search-body-match) (1)
  - [Search / Case-insensitivity](#library-search-case-insensitivity) (1)
  - [Search / Empty state](#library-search-empty-state) (1)
  - [Search / Filter composition](#library-search-filter-composition) (2)
  - [Search / Race](#library-search-race) (1)
  - [Search / Reset](#library-search-reset) (1)
  - [Search / Shortcut](#library-search-shortcut) (1)
  - [Search / Unicode](#library-search-unicode) (1)
  - [Search / Validation](#library-search-validation) (1)
  - [Security / Rendering](#library-security-rendering) (1)
  - [Selection](#library-selection) (1)
  - [Selection / Editor](#library-selection-editor) (1)
  - [Sidebar / Counts](#library-sidebar-counts) (3)
  - [Soft delete / Undo toast](#library-soft-delete-undo-toast) (7)
  - [Soft delete / Undo toast / Crash](#library-soft-delete-undo-toast-crash) (1)
  - [Soft delete / Undo toast / Quit](#library-soft-delete-undo-toast-quit) (1)
  - [Soft delete / Undo toast / Shortcuts](#library-soft-delete-undo-toast-shortcuts) (2)
  - [Title derivation](#library-title-derivation) (1)
- [Cross-window](#cross-window)
  - [Draft autosave / Quit (bug #02)](#cross-window-draft-autosave-quit-bug-02) (1)
  - [Promote](#cross-window-promote) (1)
  - [Promote / Buffer cleanup](#cross-window-promote-buffer-cleanup) (1)
  - [Promote / Filter composition](#cross-window-promote-filter-composition) (1)
  - [Promote / Markdown](#cross-window-promote-markdown) (1)
  - [Promote / Race](#cross-window-promote-race) (1)
  - [Promote / Search composition](#cross-window-promote-search-composition) (1)
  - [Promote / Selection stability](#cross-window-promote-selection-stability) (1)
  - [Promote / Title derivation](#cross-window-promote-title-derivation) (1)
  - [Promote / Validation](#cross-window-promote-validation) (2)
  - [Security / Content-Security-Policy](#cross-window-security-content-security-policy) (1)
  - [Storage fallback (bug #03)](#cross-window-storage-fallback-bug-03) (4)
  - [Storage fallback / Write failure (ADR 0008)](#cross-window-storage-fallback-write-failure-adr-0008) (1)
- [Visual](#visual)
  - [Design tokens / Bootstrap](#visual-design-tokens-bootstrap) (1)
- [Settings](#settings)
  - [Entry / Exit](#settings-entry-exit) (4)
  - [Hotkey](#settings-hotkey) (4)
  - [Language](#settings-language) (4)
  - [Palette](#settings-palette) (4)
  - [Theme](#settings-theme) (3)
  - [Update banner](#settings-update-banner) (2)

## Draft

### Autosave <a id="draft-autosave"></a>

#### [P1] Autosave commits the buffer between hide and re-summon

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `typing triggers an autosave (visible by reopening after a refresh-cycle)`
- **Type**: positive

**Preconditions:**
- Fresh app launch.

**Steps:**
1. Summon, type text, wait past the autosave debounce.
2. Hide the overlay.
3. Re-summon.

**Expected:**
- The editor contains the previously typed text on re-summon.

---

### Cancel / Hide <a id="draft-cancel-hide"></a>

#### [P0] Esc hides the overlay without promoting; scratch buffer rehydrates on re-summon

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `Esc hides the overlay without promoting; reopening restores the buffer`
- **Type**: positive

**Preconditions:**
- Library is empty.

**Steps:**
1. Summon Draft.
2. Type text and wait through the autosave debounce.
3. Press Esc to dismiss.
4. Re-summon Draft.

**Expected:**
- Library has 0 cards (Esc does NOT promote).
- On re-summon, the editor contains the previously typed text.

---

### Editor / CodeMirror <a id="draft-editor-codemirror"></a>

#### [P2] Editing mid-document (arrow back + insert) does not corrupt the buffer

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `Markdown editing mid-document does not corrupt the document`
- **Type**: edge

**Steps:**
1. Type "AB".
2. Press End, Enter.
3. Type "# H".

**Expected:**
- Editor still contains both "AB" and "H".

---

### Editor / Persistence <a id="draft-editor-persistence"></a>

#### [P2] Oversize content (~240 KB) survives hide/summon without crashing

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `overlay rejects oversize content gracefully (no crash, no truncation in UI)`
- **Type**: edge

**Steps:**
1. Summon Draft.
2. Paste a 240 KB payload into the editor.
3. Wait past autosave.
4. Hide and re-summon.

**Expected:**
- The editor still renders; textContent length > 1000 chars and
- contains the marker substring "lorem-ipsum".

---

### Encoding <a id="draft-encoding"></a>

#### [P1] Unicode (CJK + emoji + diacritics) round-trips through autosave

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `CJK + emoji content round-trips through autosave`
- **Type**: edge

**Steps:**
1. Summon, type a unicode-heavy payload.
2. Wait past autosave.
3. Hide and re-summon.

**Expected:**
- Editor contains the Japanese, Cyrillic, emoji and Latin-diacritic substrings.

---

### Focus / Blur <a id="draft-focus-blur"></a>

#### [P0] Unpinned overlay hides on window blur (Spotlight semantics)

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `losing focus hides an unpinned overlay (Spotlight-style behavior)`
- **Type**: positive

**Preconditions:**
- Draft is visible and unpinned.

**Steps:**
1. Summon Draft.
2. Synthesize a `blur` event on the Draft BrowserWindow in main.

**Expected:**
- The Draft window has at least one `blur` listener registered.
- After the blur event, the window is not visible.

**Notes:**
- We cannot drive OS focus in headless Playwright; emitting the
- event directly verifies the contract.

---

### Markdown rendering / Headings <a id="draft-markdown-rendering-headings"></a>

#### [P0] H1/H2 headings get larger font-size and bold weight; the marker is hidden on inactive lines

- **File**: `e2e/draft/markdown-render.spec.ts`
- **Test**: `markdown source styles headings and inline formatting`
- **Type**: positive

**Preconditions:**
- Draft opened.

**Steps:**
1. Type `# Heading\nplain line with **bold** and *italic*\n## Subheading`.
2. Measure computed font-size/weight on `cm-inmem-h1`, `cm-inmem-h2`, plain lines.
3. Read the textContent of the inactive `cm-inmem-h1` line.
4. Click back into the inactive H1 line to re-activate it.

**Expected:**
- H1 font-size > plain line; weight = 700.
- H2 font-size > plain line, but < H1.
- On inactive H1: leading `#` is removed from textContent; "Heading" stays.
- After click: leading `#` re-appears so the syntax is editable.

---

#### [P1] H3 font-size sits between H2 and body text (cascade)

- **File**: `e2e/draft/markdown-render.spec.ts`
- **Test**: `h3 heading scales between h2 and body text`
- **Type**: edge

**Steps:**
1. Type `# One\n## Two\n### Three\nbody`.
2. Measure font-size of each heading class and a body line.

**Expected:**
- H1 > H2 > H3 ≥ body font-size.

---

#### [P1] `#NotAHeading` (no trailing space) is NOT styled as a heading

- **File**: `e2e/draft/markdown-render.spec.ts`
- **Test**: `"#Foo" without a space is NOT a heading`
- **Type**: negative

**Steps:**
1. Type `#NotAHeading\nbody`.
2. Inspect the line containing "NotAHeading".

**Expected:**
- The line does NOT carry the `cm-inmem-h1` class.

**Notes:**
- CommonMark requires whitespace after `#`; the decoration code must respect that.

---

### Markdown rendering / Lists <a id="draft-markdown-rendering-lists"></a>

#### [P1] A leading hyphen without trailing space is NOT a bullet

- **File**: `e2e/draft/list-quote-render.spec.ts`
- **Test**: `a leading hyphen without a trailing space does not become a bullet`
- **Type**: negative

**Steps:**
1. Type `-12 cm of rain`, Enter, then "next".
2. Inspect the line containing "12 cm".

**Expected:**
- The line has 0 `.cm-inmem-bullet` widgets.

**Notes:**
- Decoration must require the trailing whitespace; otherwise text like
- "-12" would be mistaken for a list marker.

---

#### [P2] Asterisk-style bullets (`*`) render the same widget as dash-style (`-`)

- **File**: `e2e/draft/list-quote-render.spec.ts`
- **Test**: `asterisk bullets render with the same bullet widget as dash bullets`
- **Type**: edge

**Steps:**
1. Type `* star bullet`, Enter, then a character so the previous line is inactive.
2. Inspect the inactive line.

**Expected:**
- The line carries the `.cm-inmem-bullet` widget.
- textContent contains "•" and does NOT start with "*".

---

### Markdown rendering / Lists & Quotes <a id="draft-markdown-rendering-lists-quotes"></a>

#### [P0] Bullet/numbered list lines get widget decorations; blockquote gets accent stripe and italic

- **File**: `e2e/draft/list-quote-render.spec.ts`
- **Test**: `lists render with bullet widgets and quotes get the accent stripe`
- **Type**: positive

**Steps:**
1. Type a `- bullet one` line, then `1. numbered one`, then `> quoted line`,
2. then a plain trailing line. Wipe each line before typing to defeat
3. CodeMirror's list auto-continue.
4. Read computed styles and widget elements on each line.

**Expected:**
- Bullet line: contains a `.cm-inmem-bullet` widget; textContent starts with "•",
- not "-".
- Numbered line: contains a `.cm-inmem-ol` widget; textContent contains "1.".
- Quote line: has class `cm-inmem-quote`; computed `font-style` is italic;
- `box-shadow` is non-`none` (accent stripe).

---

### Persistence <a id="draft-persistence"></a>

#### [P0] Scratch buffer survives a full app restart (cmd-Q mid-thought)

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `the scratch buffer survives a full app restart in the same userData dir`
- **Type**: persistence

**Preconditions:**
- Fresh userData directory.

**Steps:**
1. Launch app; summon Draft; type text; wait past autosave debounce.
2. Close the app entirely.
3. Re-launch the app pointing at the same userData directory.
4. Summon Draft again.

**Expected:**
- The scratch buffer rehydrates with the previously typed text.

---

#### [P0] Cross-launch buffer rehydration after summon → type → hide → restart

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `summon → type → hide → restart still rehydrates the buffer (cross-launch)`
- **Type**: persistence

**Steps:**
1. Launch app, summon, type text, wait past autosave, hide, close app.
2. Re-launch with the same userData; summon Draft.

**Expected:**
- The scratch buffer rehydrates with the previously typed text.

---

### Pin / AlwaysOnTop <a id="draft-pin-alwaysontop"></a>

#### [P0] Pinned overlay stays visible when another window takes focus

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `pin keeps the overlay always-on-top: blur should NOT hide it`
- **Type**: positive

**Preconditions:**
- Draft summoned and pinned.

**Steps:**
1. Summon Draft, type text, wait past autosave debounce.
2. Click the pin button; wait for the pin animation to settle.
3. Bring the Library window to the front (simulating focus change).

**Expected:**
- Draft remains visible after Library takes focus.
- `BrowserWindow.isAlwaysOnTop()` reports `true` after pin.

---

#### [P0] `alwaysOnTop` flag flips with pin state

- **File**: `e2e/draft/pin-resize.spec.ts`
- **Test**: `alwaysOnTop flips with pin state`
- **Type**: positive

**Steps:**
1. Summon → check `isAlwaysOnTop()` is false.
2. Click pin (await animation) → check `isAlwaysOnTop()` is true.
3. Click pin again (await animation) → check false again.

**Expected:**
- `isAlwaysOnTop()` matches the current pinned state at each step.

---

### Pin / Anchor <a id="draft-pin-anchor"></a>

#### [P1] First pin lands at the design-default top-right anchor

- **File**: `e2e/draft/pin-drag.spec.ts`
- **Test**: `first pin lands in the top-right anchor by design`
- **Type**: positive

**Steps:**
1. Summon, type, pin (await animation).
2. Measure window bounds relative to the work area.

**Expected:**
- Window right edge is within ~40 px of the work-area right edge.
- Window top edge is within ~40 px of the work-area top edge.

**Notes:**
- The internal `lastPinnedCorner` field only updates through the
- native mouseUp stream which Playwright cannot drive. We assert the
- observable geometry instead of internal state.

---

#### [P2] `getCorner()` returns the current pin anchor ('tr' by default)

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `getCorner reports the current pin anchor`
- **Type**: positive

**Steps:**
1. Summon, pin (await animation).
2. Call `getCorner()`.

**Expected:**
- Returned value is `'tr'`.

---

### Pin / Cancel <a id="draft-pin-cancel"></a>

#### [P1] Esc on a pinned overlay is a no-op

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `Esc on a PINNED overlay is a no-op: window stays visible (no hide)`
- **Type**: negative

**Preconditions:**
- Draft pinned with non-empty content.

**Steps:**
1. Summon, type text, pin (await animation).
2. Press Escape.

**Expected:**
- The Draft window remains visible (pinned guards against hide).

---

### Pin / Drag-to-corner <a id="draft-pin-drag-to-corner"></a>

#### [P0] Dragging the pinned window into a quadrant snaps it to that corner

- **File**: `e2e/draft/pin-drag.spec.ts`
- **Test**: `drop on the ${corner} quadrant snaps the window into the ${corner} corner`
- **Type**: positive

**Preconditions:**
- Draft pinned with content.

**Steps:**
1. Summon, type, pin (await animation).
2. Programmatically `setBounds` so the window center lands in the
3. target quadrant (tl/tr/bl/br).
4. Wait for the snap animation.

**Expected:**
- The window's resulting center quadrant matches the target corner.

---

### Pin / Manual resize <a id="draft-pin-manual-resize"></a>

#### [P0] `setPinSize` grows the pinned window from its anchor and clamps to ~45 % of the work area

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `setPinSize grows the window from the anchor and clamps to 45% of work area`
- **Type**: positive

**Steps:**
1. Summon, type, pin (await animation).
2. Record baseline bounds + top-right anchor coordinates.
3. Call `setPinSize({ width: 9999, height: 9999 })`.

**Expected:**
- Resulting width ≤ round(workArea.width * 0.45) + 1.
- Resulting height ≤ round(workArea.height * 0.45) + 1.
- Width is strictly larger than 320 (the resize actually grew).
- Top-right anchor X and Y are unchanged.

---

#### [P1] `resetPinSize` animates back to the design-default pin width

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `resetPinSize restores the default pin width with animation`
- **Type**: positive

**Steps:**
1. Summon, pin, grow via `setPinSize({500, 400})`.
2. Call `resetPinSize()`.
3. Wait through the snap animation.

**Expected:**
- After grow: width > 320.
- After reset: width = 320.

---

#### [P1] `setPinSize` is a no-op when the overlay is UNPINNED

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `setPinSize is a no-op while the overlay is UNPINNED`
- **Type**: negative

**Steps:**
1. Summon (do NOT pin), record baseline width.
2. Call `setPinSize({400, 400})`.

**Expected:**
- Width does not change.

---

#### [P1] Shrink below minimum is clamped to a sane floor

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `shrinking below the minimum is clamped to the minimum (not negative)`
- **Type**: edge

**Steps:**
1. Summon, pin (await animation).
2. Call `setPinSize({10, 10})` (well below the floor).

**Expected:**
- Width ≥ 200, height ≥ 80 (generous lower bounds — exact floor is
- defined in `clampPinSize`).

---

#### [P1] Chained `setPinSize` calls do not let the anchor drift

- **File**: `e2e/draft/pin-resize-manual.spec.ts`
- **Test**: `multiple grows compose without anchor drift`
- **Type**: race

**Steps:**
1. Summon, pin (await animation), record anchor (top-right) X, Y.
2. Call `setPinSize` four times with increasing widths (360→480).

**Expected:**
- The top-right X (anchor) is unchanged across the chain.
- The Y of the top-right anchor is unchanged.

---

### Pin / Window geometry <a id="draft-pin-window-geometry"></a>

#### [P0] Pin/unpin shrinks/restores the BrowserWindow width between 560 and 320 px

- **File**: `e2e/draft/pin-resize.spec.ts`
- **Test**: `pin/unpin resizes the BrowserWindow between 560 and 320`
- **Type**: positive

**Steps:**
1. Summon, type, measure baseline width.
2. Click pin (await animation), measure width.
3. Click pin again to unpin (await animation), measure width.

**Expected:**
- Baseline width = 560.
- Pinned width = 320.
- Unpinned width = 560 again.

---

#### [P1] Repeated pin/unpin toggles keep the window width stable

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `pin toggle is reversible and bounds-stable across many cycles`
- **Type**: race

**Steps:**
1. Summon, type, wait past autosave.
2. Click the pin button 4 times (even count → unpinned end state).

**Expected:**
- Final window width is 560 px (the unpinned default).

---

#### [P1] Many pin/unpin toggles do not let the window width drift

- **File**: `e2e/draft/pin-resize.spec.ts`
- **Test**: `width does not drift after many toggles (state-machine stability)`
- **Type**: race

**Steps:**
1. Summon, type, await autosave.
2. Toggle pin off/on/off… 3 full cycles (6 clicks).
3. Pin once more.

**Expected:**
- After even toggles: width = 560 px (unpinned default).
- After the extra pin: width = 320 px.

---

### Positioning <a id="draft-positioning"></a>

#### [P1] Summon centers the overlay on the cursor display work-area

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `summon centers the overlay on the work-area of the cursor display`
- **Type**: positive

**Steps:**
1. Summon Draft.
2. Compare the window center to the work-area center.

**Expected:**
- Center deviation ≤ 80 px on both axes (allowing for rounding/DPR).

---

### Promote <a id="draft-promote"></a>

#### [P0] Empty/whitespace draft does not promote on ⌘↵

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `empty draft promote (⌘↵) does not create a note and clears the buffer`
- **Type**: negative

**Preconditions:**
- Library is empty.

**Steps:**
1. Summon, type only whitespace, wait past autosave.
2. Press ⌘↵.

**Expected:**
- No Library card created.

---

### Security / Screen capture <a id="draft-security-screen-capture"></a>

#### [P0] Content protection (NSWindowSharingNone) is preserved across pin/unpin cycles

- **File**: `e2e/draft/content-protection.spec.ts`
- **Test**: `draft window keeps content protection across pin/unpin cycles`
- **Type**: positive

**Preconditions:**
- macOS host with `setContentProtection` available on BrowserWindow.

**Steps:**
1. Confirm `setContentProtection` is a function on the live Draft window.
2. Patch `BrowserWindow.prototype.setContentProtection` to record every call.
3. Summon Draft, type, then pin → unpin → pin (await each animation).
4. Read back the recorded calls; restore the original method.

**Expected:**
- The API is present on the window.
- The recorded calls do NOT include any `false` argument.
- `isContentProtected()` on the Draft window is `true` after the cycle.

---

### Summon <a id="draft-summon"></a>

#### [P0] Summon shows the editable overlay with the correct title

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `summon shows the overlay and the editor becomes editable`
- **Type**: positive

**Preconditions:**
- App launched with a fresh userData directory.

**Steps:**
1. Trigger Draft summon via the test-mode IPC affordance.
2. Wait for the Draft window to appear and finish loading.

**Expected:**
- The editor surface (`.cm-content`) is visible.
- The header text "Быстрая заметка" is rendered (i18n applied).
- The window URL routes to `view=draft`.

---

### Window lifecycle <a id="draft-window-lifecycle"></a>

#### [P1] Rapid summon/hide cycles do not spawn duplicate Draft windows

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `rapid toggle does not multiply Draft windows (race-resistant)`
- **Type**: race

**Preconditions:**
- Single Draft window invariant.

**Steps:**
1. Loop 6 times: summon, then hide.
2. Inspect all open BrowserWindows in main.

**Expected:**
- Exactly one window matches `view=draft`.

---

#### [P1] Toggle while hidden re-shows the same window

- **File**: `e2e/draft/lifecycle.spec.ts`
- **Test**: `toggle while hidden re-shows the same window (idempotent visibility)`
- **Type**: positive

**Steps:**
1. Summon → assert visible.
2. Hide → assert hidden.
3. Summon → assert visible.

**Expected:**
- Visibility flips correctly across summon/hide; the same window
- instance is reused.

---

## Library

### Autosave / Debounce <a id="library-autosave-debounce"></a>

#### [P1] Debounced autosave coalesces fast edits — the final state is what gets persisted

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `debounced autosave: a fast-then-pause edit pattern commits only the final state`
- **Type**: persistence

**Steps:**
1. Launch, ⌘N.
2. Type "step 1", short pause, "step 2", short pause, "step 3", long pause (> debounce).
3. Close app, re-launch with same userData.

**Expected:**
- The reloaded editor contains all three steps in order.

---

### Autosave / Note switch <a id="library-autosave-note-switch"></a>

#### [P0] Typing then switching notes within 500 ms keeps the full text

- **File**: `e2e/library/autosave-flush.spec.ts`
- **Test**: `typing then switching notes inside 500 ms does not drop the tail`
- **Type**: race

**Steps:**
1. Create notes "Alpha" and "Bravo" and wait until both are stored.
2. Select "Alpha", type " tail" and click the "Bravo" card straight
3. away (inside the 500 ms debounce).
4. Quit and relaunch on the same userData.

**Expected:**
- Main stores "Alpha tail" without waiting for the debounce, and
- "Bravo" is untouched.
- After the relaunch the "Alpha tail" card is still there.

---

### Autosave / Quit <a id="library-autosave-quit"></a>

#### [P0] Typing then quitting the app within 500 ms keeps the full text

- **File**: `e2e/library/autosave-flush.spec.ts`
- **Test**: `typing then quitting inside 500 ms does not drop the tail`
- **Type**: persistence

**Steps:**
1. Create a note "Before quit" and wait until it is stored.
2. Type " and after" and quit the app immediately (inside the 500 ms
3. debounce).
4. Relaunch on the same userData.

**Expected:**
- The relaunched Library lists one card and its editor shows
- "Before quit and after".

---

### Autosave / Window close <a id="library-autosave-window-close"></a>

#### [P1] Typing then closing the Library window within 500 ms keeps the full text

- **File**: `e2e/library/autosave-flush.spec.ts`
- **Test**: `typing then closing the window inside 500 ms keeps the tail; activate reopens it`
- **Type**: persistence

**Steps:**
1. Create a note "Window text" and wait until it is stored.
2. Type " survives close" and close the Library window right away.
3. Re-open the Library the way a Dock click does (macOS `activate`).

**Expected:**
- The app keeps running with no Library window after the close.
- The reopened Library lists one card whose text is
- "Window text survives close" (read back from main, not from cache).

**Notes:**
- macOS only: other platforms quit when the last window closes.

---

### Autosave / ⌘↵ (bug #06) <a id="library-autosave-bug-06"></a>

#### [P1] ⌘↵ in the Library editor saves at once, without a blank line or a new note

- **File**: `e2e/library/autosave-flush.spec.ts`
- **Test**: `⌘↵ flushes immediately, adds no blank line and creates no note`
- **Type**: positive

**Steps:**
1. Create a note "Seed" and wait until it is stored.
2. Freeze the page clock so the 500 ms debounce timer can never fire.
3. Type " more" and press ⌘↵.

**Expected:**
- Main stores "Seed more" although the debounce never elapsed, i.e.
- ⌘↵ flushed synchronously.
- The editor text is exactly "Seed more" (no inserted blank line).
- Still one card and one stored note (⌘↵ does not promote or create).

---

### CRUD <a id="library-crud"></a>

#### [P0] Empty Library → create via ⌘N → edit → delete

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `starts empty, lets user create, edit, and delete a note`
- **Type**: positive

**Steps:**
1. Verify empty state ("Заметка не выбрана") on a fresh userData.
2. Press ⌘N → assert one card and the editor mounts.
3. Type "Hello Library", wait past autosave.
4. Switch sidebar filter to "Все заметки".
5. Click the delete button.

**Expected:**
- After ⌘N: 1 card, editor visible.
- After typing: first card contains "Hello Library".
- After delete: 0 cards, empty-state placeholder visible.

---

### Create / Race <a id="library-create-race"></a>

#### [P1] Rapid ⌘N spam does not lose or duplicate notes

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `⌘N spam does not create duplicates or hang (race-resistant)`
- **Type**: race

**Steps:**
1. Press ⌘N 5 times in rapid succession.

**Expected:**
- Exactly 5 cards present.

---

### Create / Untitled <a id="library-create-untitled"></a>

#### [P1] A brand-new empty note still appears in the list (untitled placeholder)

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `a brand-new note with no content still survives in the list (untitled)`
- **Type**: negative

**Steps:**
1. Press ⌘N.
2. Do NOT type anything; switch filter to "Все заметки".

**Expected:**
- 1 card visible.
- Card title is "Без заголовка" (untitled placeholder).

---

### Delete <a id="library-delete"></a>

#### [P1] Deleting the active (newest) note leaves the older note intact

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `delete on a note that is not the currently selected one resolves cleanly`
- **Type**: positive

**Steps:**
1. ⌘N "keep me" (wait for card title).
2. ⌘N "delete me" (wait for card title) — active is the newer card.
3. Press the delete button.

**Expected:**
- 1 card remaining, containing "keep me".

---

### Delete / Empty state <a id="library-delete-empty-state"></a>

#### [P1] Deleting the last note restores the empty-state placeholder + ⌘N hint

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `delete of last note returns the editor to the empty placeholder`
- **Type**: positive

**Steps:**
1. ⌘N, type "only one", wait for card title.
2. Click delete.

**Expected:**
- 0 cards.
- "Заметка не выбрана" visible.
- "Выбери заметку слева или создай новую — ⌘N" hint visible.

---

### Filter <a id="library-filter"></a>

#### [P0] "Pinned" filter shows only pinned notes

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `Pinned filter shows only pinned notes`
- **Type**: positive

**Steps:**
1. Create "plain note" (unpinned) and "important note" (pin it).
2. Click sidebar filter "Закреплённые".
3. Click sidebar filter "Все заметки".

**Expected:**
- In pinned mode: 1 card ("important note").
- In all mode: 2 cards.

---

### Persistence <a id="library-persistence"></a>

#### [P0] Library notes survive a full app restart in the same userData

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `persists notes across app restarts in the same userData dir`
- **Type**: persistence

**Steps:**
1. Launch app, ⌘N, type "Persisted across runs", wait past autosave.
2. Close the app.
3. Re-launch pointing at the same userData directory.

**Expected:**
- 1 card present; clicking it loads the editor with the same text.

---

### Persistence / Large content <a id="library-persistence-large-content"></a>

#### [P1] Multi-KB body survives an app restart with the trailing marker intact

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `multi-KB content saves and reloads on restart with the tail marker intact`
- **Type**: persistence

**Steps:**
1. Launch app, ⌘N.
2. Paste "Big note title\n<~4 KB filler><TAIL-MARKER-βγΩ>", wait past autosave.
3. Close, re-launch with same userData.
4. Click the card; scroll CM6 viewport to the end via ⌘+End.

**Expected:**
- Editor contains the tail marker.

**Notes:**
- Payload is sized to fit the CM6 viewport so textContent is reliable.

---

### Pin <a id="library-pin"></a>

#### [P0] Pin toggle flips editor label and surfaces a pin marker on the card

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `pin toggles editor state and surfaces a pin marker on the card`
- **Type**: positive

**Steps:**
1. Create "important", wait past autosave.
2. Click the pin button → "закреплено" label visible; card shows pin icon.
3. Click again → "не закреплено" visible.

**Expected:**
- Editor label toggles between "не закреплено" and "закреплено".
- Pin SVG marker is visible on the card in pinned state.

---

### Pin / Filter <a id="library-pin-filter"></a>

#### [P1] Unpinning the only pinned note empties the Pinned filter view

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `pinning the only note then switching to Pinned filter shows it`
- **Type**: edge

**Steps:**
1. Create "alone", wait past autosave, pin.
2. Switch filter to "Закреплённые" → 1 card.
3. Click pin again to unpin.

**Expected:**
- 0 cards visible; empty-state copy ("В этом разделе пусто" or
- "Ничего не найдено") is shown.

---

### Pin / Ordering <a id="library-pin-ordering"></a>

#### [P0] Pinning an older note moves it to the top of the list

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `pinned notes rise to the top of the list`
- **Type**: positive

**Steps:**
1. Create "older", then "newer".
2. Click the older (last) card, pin it.

**Expected:**
- First card now contains "older".

---

#### [P1] Multiple pinned notes preserve their relative order above unpinned ones

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `multiple pinned notes preserve their relative order (newer-pinned first)`
- **Type**: positive

**Steps:**
1. Create alpha, bravo, charlie (each waits for its card title).
2. Pin alpha (last card), then pin charlie (locate by text).

**Expected:**
- First two cards are the pinned ones (alpha, charlie — order may
- depend on most-recently-pinned).
- Third card is "bravo" (unpinned).

---

### Pin / Persistence <a id="library-pin-persistence"></a>

#### [P0] Pin state survives a full app restart

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `pin state survives an app restart`
- **Type**: persistence

**Steps:**
1. Launch, ⌘N "persisted pin", wait past autosave, pin.
2. Close app, re-launch with same userData.
3. Click the card.

**Expected:**
- Editor shows "закреплено" after the restart.

---

### Pin / Race <a id="library-pin-race"></a>

#### [P1] Rapid pin spam does not desync the UI label from the actual pin state

- **File**: `e2e/library/pin.spec.ts`
- **Test**: `rapid pin spam does not desync the UI label and the actual pin state`
- **Type**: race

**Steps:**
1. Create "racy", wait past autosave.
2. Click pin 6 times with a small inter-click delay.
3. Wait briefly for `notes:changed` broadcasts to settle.
4. Switch filter to "Закреплённые".

**Expected:**
- Even number of clicks → editor label is "не закреплено".
- Pinned filter view contains 0 cards.

---

### Search <a id="library-search"></a>

#### [P0] Live search narrows the list to matching notes and highlights the hit

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `live-search narrows the list to matching notes and highlights the hit`
- **Type**: positive

**Steps:**
1. Create three notes: "Buy coffee beans", "Vacation plans for July",
2. "Coffee machine cleanup".
3. Type "coffee" into the search field.

**Expected:**
- Exactly 2 cards visible.
- First `.lib-hl` mark contains the substring "coffee" (case-insensitive).

---

### Search / Body match <a id="library-search-body-match"></a>

#### [P1] Search matches the BODY of a note, not only the title

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `search matches the BODY of a note, not only the title`
- **Type**: positive

**Steps:**
1. Create "Daily standup\ndiscussed blockers and shipped a fix" and "other".
2. Search "blockers".

**Expected:**
- 1 card returned, containing "Daily standup".

---

### Search / Case-insensitivity <a id="library-search-case-insensitivity"></a>

#### [P1] Search is case-insensitive (upper-case query hits lower-case content)

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `case-insensitive match: "BEANS" hits a card containing "beans"`
- **Type**: edge

**Steps:**
1. Create note "Buy coffee beans".
2. Search "BEANS".

**Expected:**
- 1 card; highlight mark contains "beans".

---

### Search / Empty state <a id="library-search-empty-state"></a>

#### [P2] Zero-result query renders the "queryNoMatch" copy with the literal query in quotes

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `zero results renders the "queryNoMatch" copy with the actual query string`
- **Type**: negative

**Steps:**
1. Create "alpha".
2. Search "zebra".

**Expected:**
- 0 cards.
- Body contains the literal "«zebra»".

---

### Search / Filter composition <a id="library-search-filter-composition"></a>

#### [P1] Active search overrides the sidebar filter (search hits all notes)

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `search + Pinned filter compose: search is applied to all notes regardless of filter`
- **Type**: edge

**Steps:**
1. Create "alpha pinned" (pinned) and "alpha plain".
2. Switch filter to "Закреплённые" → 1 card.
3. Type "alpha" into search.

**Expected:**
- With search active: 2 cards (search bypasses the pinned filter).

---

#### [P1] Clearing search restores the previously selected sidebar filter

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `clearing query restores the list to the previously-selected filter`
- **Type**: positive

**Steps:**
1. Create "one" (pinned) and "two" (unpinned).
2. Switch filter to "Закреплённые" → 1 card.
3. Type "two" → 1 card "two" (search overrides filter).
4. Press Esc in search.

**Expected:**
- 1 card visible after Esc, containing "one" (filter back in effect).

---

### Search / Race <a id="library-search-race"></a>

#### [P1] Rapid keystrokes converge on the final query (no stale result)

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `typing rapidly through several keystrokes converges on the final query`
- **Type**: race

**Steps:**
1. Create three notes whose titles share no common prefix
2. ("zebra crossing", "mango sticky rice", "octopus party").
3. Type "zebra" into the search field as a fast keystroke burst.

**Expected:**
- 1 card containing "zebra" is the final stable list.

**Notes:**
- Words intentionally have no shared prefix so a stale intermediate
- response is distinguishable from the correct final one.

---

### Search / Reset <a id="library-search-reset"></a>

#### [P1] Esc in the search field clears the query and restores the full list

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `Esc clears the search and restores the full list`
- **Type**: positive

**Steps:**
1. Create two notes ("alpha", "beta").
2. Type a no-match query "zzz no match".
3. Press Esc in the search field.

**Expected:**
- During no-match: 0 cards + "Запрос «...» ничего не нашёл" copy.
- After Esc: full list (2 cards) restored.

---

### Search / Shortcut <a id="library-search-shortcut"></a>

#### [P1] ⌘F focuses the Library search input

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `⌘F focuses the search input`
- **Type**: positive

**Steps:**
1. Press ⌘F.

**Expected:**
- `document.activeElement.aria-label === "Search"`.

---

### Search / Unicode <a id="library-search-unicode"></a>

#### [P1] Cyrillic search query matches Cyrillic content

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `unicode query (Cyrillic) hits Cyrillic content`
- **Type**: edge

**Steps:**
1. Create "Список покупок: молоко, хлеб" and "Гулять в парке".
2. Search "хлеб".

**Expected:**
- 1 card returned, containing "молоко".

---

### Search / Validation <a id="library-search-validation"></a>

#### [P1] Whitespace-only query is treated as no query (full list)

- **File**: `e2e/library/search-filter.spec.ts`
- **Test**: `whitespace-only query is equivalent to no query (full list)`
- **Type**: negative

**Steps:**
1. Create two notes ("first", "second").
2. Type 5 spaces into the search field.

**Expected:**
- Full list visible (2 cards).

---

### Security / Rendering <a id="library-security-rendering"></a>

#### [P0] XSS / SQL-injection-shaped payload is rendered as literal text (no DOM injection, no DB damage)

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `special characters: HTML/SQL injection-shaped payload renders as literal text`
- **Type**: negative

**Steps:**
1. ⌘N.
2. Type `<script>window.__pwned=true</script> "; DROP TABLE notes; --`.
3. Wait for the title to update.

**Expected:**
- `window.__pwned` is undefined (not `true`) → no script execution.
- Card title contains "script" and "DROP TABLE" as literal text.

**Notes:**
- The list renders titles via dangerouslySetInnerHTML for highlight;
- the highlighter MUST HTML-escape the input.

---

### Selection <a id="library-selection"></a>

#### [P1] Keyboard-only flow: ⌘N twice creates two notes, latest is selected

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `keyboard-only: ⌘N twice creates two notes and the editor focuses the latest`
- **Type**: positive

**Steps:**
1. Press ⌘N twice.

**Expected:**
- 2 cards.
- First (newest) card has `aria-current="true"`.

---

### Selection / Editor <a id="library-selection-editor"></a>

#### [P0] Switching between two notes preserves each note's body

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `switching between notes preserves their distinct contents`
- **Type**: positive

**Steps:**
1. Create note A "First note body" (wait for card title).
2. Create note B "Second note body" (wait for card title).
3. Click the older card (last) → editor shows A.
4. Click the newer card (first) → editor shows B.

**Expected:**
- Each card shows the corresponding body when selected; no body bleed
- across the autosave debounce.

---

### Sidebar / Counts <a id="library-sidebar-counts"></a>

#### [P1] Sidebar counts follow create, pin, unpin and delete

- **File**: `e2e/library/sidebar-counts.spec.ts`
- **Test**: `counts react to create, pin, unpin, delete and undo`
- **Type**: positive

**Steps:**
1. Fresh userData: read both badges.
2. ⌘N twice (two notes), pin the selected one, unpin it, pin it again.
3. Delete the pinned note (soft delete), then click "Отменить".
4. Delete the pinned note again and dismiss the toast with "×".

**Expected:**
- Start: "Все заметки" 0, "Закреплённые" 0.
- After two creates: 2 / 0. After pinning: 2 / 1. After unpin: 2 / 0.
- Delete of a pinned note: 1 / 0 at once (the card is hidden at once);
- Undo brings back 2 / 1.
- After the second delete is committed the counts stay 1 / 0.

---

#### [P2] Counts are the same after a restart as before it

- **File**: `e2e/library/sidebar-counts.spec.ts`
- **Test**: `counts are restored after a restart`
- **Type**: persistence

**Steps:**
1. Create three notes, pin one, wait until main has stored them.
2. Quit and relaunch on the same userData.

**Expected:**
- "Все заметки" 3 and "Закреплённые" 1 right after the relaunch.

---

#### [P2] Sidebar totals do not change when a filter or a search narrows the list

- **File**: `e2e/library/sidebar-counts.spec.ts`
- **Test**: `totals stay put under the Pinned filter and a search`
- **Type**: negative

**Steps:**
1. Create two notes and pin one ("Все заметки" 2, "Закреплённые" 1).
2. Click "Закреплённые", then search for a string that matches nothing.

**Expected:**
- Both badges keep showing the Library totals (2 and 1): they label
- sections of the whole Library, not the current result list.

**Notes:**
- test.fixme: the badges are derived from the filtered `notes` cache
- (`LibrarySidebar` counts `s.library.notes`), so "Все заметки" drops
- to 1 under the Pinned filter and both drop to 0 during a search.

---

### Soft delete / Undo toast <a id="library-soft-delete-undo-toast"></a>

#### [P0] Delete hides the note at once and Undo restores and re-selects it

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `delete hides the card at once; Undo restores it and re-selects it`
- **Type**: positive

**Steps:**
1. Create notes "Alpha note" then "Bravo note" (Bravo is selected).
2. Click the delete button.
3. Click "Отменить" in the toast.

**Expected:**
- After delete: only the Alpha card is listed, the toast is visible
- and the editor shows Alpha; the main process still holds both notes.
- After Undo: both cards are back, the toast is gone, the Bravo card
- is the selected one and the editor shows "Bravo note".

---

#### [P0] An undone delete is permanent across a restart

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `undo then restart: the note is still there`
- **Type**: persistence

**Steps:**
1. Create a note "Keep me", delete it, click "Отменить".
2. Quit and relaunch on the same userData.

**Expected:**
- The relaunched Library lists exactly one card, "Keep me".

---

#### [P0] When the toast expires the delete is committed

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `after the toast expires the delete is permanent, also after restart`
- **Type**: persistence

**Steps:**
1. Create notes "Stays" and "Goes away"; delete "Goes away".
2. Do nothing until the toast disappears by itself (about 6 s).
3. Quit and relaunch on the same userData.

**Expected:**
- While the toast is up, main still holds "Goes away".
- After the toast is gone, main no longer holds it.
- The relaunched Library lists exactly one card, "Stays".

---

#### [P1] Delete right after typing keeps the typed text through Undo

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `delete immediately after typing: Undo brings back the full text`
- **Type**: race

**Steps:**
1. Create a note "Base text".
2. Type " plus fresh words" and click delete before the 500 ms
3. autosave debounce can fire.
4. Click "Отменить".

**Expected:**
- The restored note's editor shows "Base text plus fresh words" and
- main stores the same body (the pending edit was flushed on delete,
- not restored from a stale copy).

---

#### [P1] Deleting a second note commits the first pending delete

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `a second delete commits the first; Undo only restores the latest`
- **Type**: positive

**Steps:**
1. Create notes "Alpha note", "Bravo note", "Charlie note".
2. Delete "Charlie note", then delete "Bravo note" (selected next).
3. Click "Отменить".
4. Quit and relaunch on the same userData.

**Expected:**
- After the second delete: main no longer holds "Charlie note" but
- still holds "Bravo note"; the toast is visible.
- Undo brings back "Bravo note" only; "Charlie note" stays gone.
- After the relaunch: exactly "Alpha note" and "Bravo note" remain.

---

#### [P2] "×" on the toast commits the delete immediately

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `dismissing the toast with × commits the delete without waiting`
- **Type**: positive

**Steps:**
1. Create a note "Short lived"; delete it.
2. Click "×" (Закрыть) on the toast.

**Expected:**
- The toast disappears at once and main no longer holds the note
- (no 6 s wait needed).

---

#### [P2] Hovering the toast pauses its timer; leaving resumes it

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `hovering the toast keeps it past 6 s; leaving lets it expire`
- **Type**: positive

**Steps:**
1. Create a note "Hover me"; delete it.
2. Move the mouse onto the toast and keep it there for 6.5 s (longer
3. than the 6 s window).
4. Move the mouse away.

**Expected:**
- The toast is still visible after 6.5 s of hover and main still holds
- the note (an unpaused toast would have committed at 6 s).
- After the mouse leaves, the toast times out by itself and main no
- longer holds the note.

---

### Soft delete / Undo toast / Crash <a id="library-soft-delete-undo-toast-crash"></a>

#### [P1] A crash with the toast still up leaves the note intact (safe failure)

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `a crash with a pending delete keeps the note`
- **Type**: persistence

**Steps:**
1. Create a note "Crash survivor"; delete it (toast is up).
2. SIGKILL the main process (no beforeunload, no will-quit), then
3. relaunch on the same userData.

**Expected:**
- The note is back in the Library with its text: the delete was never
- sent, which is the documented safe failure.

---

### Soft delete / Undo toast / Quit <a id="library-soft-delete-undo-toast-quit"></a>

#### [P1] Quitting with the toast still up commits the delete

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `a graceful quit with a pending delete commits it`
- **Type**: persistence

**Steps:**
1. Create a note "Quit victim"; delete it (toast is up).
2. Quit the app normally (app.quit) and relaunch on the same userData.

**Expected:**
- The note is gone: the user saw it disappear, and the window-unload
- hook commits the pending delete (TZ §4a.6).

---

### Soft delete / Undo toast / Shortcuts <a id="library-soft-delete-undo-toast-shortcuts"></a>

#### [P1] ⌘Z with focus outside the editor undoes the delete

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `⌘Z outside the editor undoes the delete`
- **Type**: positive

**Steps:**
1. Create notes "Alpha note" and "Bravo note"; delete "Bravo note".
2. Click an inert area of the sidebar so focus leaves the editor.
3. Press ⌘Z.

**Expected:**
- The toast disappears, "Bravo note" is listed again and selected.

---

#### [P1] ⌘Z inside the editor stays with the editor and does not undo the delete

- **File**: `e2e/library/undo-delete.spec.ts`
- **Test**: `⌘Z inside the editor does not undo the delete`
- **Type**: negative

**Steps:**
1. Create notes "Alpha note" and "Bravo note"; delete "Bravo note".
2. Focus the editor (now showing "Alpha note") and press ⌘Z.
3. Move focus outside the editor and press ⌘Z again.

**Expected:**
- After the first ⌘Z: the toast is still visible, only one card is
- listed, "Alpha note" keeps its text.
- After the second ⌘Z: the delete is undone (so the first press did
- not consume or commit anything).

---

### Title derivation <a id="library-title-derivation"></a>

#### [P1] Title is derived from the first non-empty line of the body

- **File**: `e2e/library/crud.spec.ts`
- **Test**: `multi-line content uses the first non-empty line as the title`
- **Type**: positive

**Steps:**
1. ⌘N.
2. Type "Real title", Enter, "body line one", Enter, "body line two".

**Expected:**
- The first card's title contains "Real title".
- The title does NOT contain body lines.

---

## Cross-window

### Draft autosave / Quit (bug #02) <a id="cross-window-draft-autosave-quit-bug-02"></a>

#### [P0] Typing into Draft then quitting within 500 ms keeps the full text

- **File**: `e2e/cross-window/quit-flush.spec.ts`
- **Test**: `typing into Draft and quitting inside 500 ms does not drop the tail`
- **Type**: persistence

**Steps:**
1. Summon Draft and type "last words before quit" without waiting for
2. the autosave debounce.
3. Quit the app immediately (inside the 500 ms window).
4. Relaunch on the same userData and summon Draft.

**Expected:**
- The summoned Draft contains the whole text, including the final
- characters typed just before the quit.

---

### Promote <a id="cross-window-promote"></a>

#### [P0] ⌘↵ in Draft creates a Library note and clears the scratch buffer

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `⌘↵ in Draft creates a Library note and clears the scratch buffer`
- **Type**: positive

**Steps:**
1. Verify Library is empty.
2. Summon Draft, type "# Promoted heading\nbody line", press ⌘↵.
3. Re-summon Draft and inspect the editor contents.

**Expected:**
- Library now has 1 card containing "Promoted heading".
- On re-summon, the editor does NOT contain "Promoted heading" or "body line".

---

### Promote / Buffer cleanup <a id="cross-window-promote-buffer-cleanup"></a>

#### [P1] After promote → Esc, the scratch buffer is empty and no duplicate note is created

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote then Esc — buffer is empty AND no duplicate note is created`
- **Type**: positive

**Steps:**
1. Summon, type "once and done", ⌘↵.
2. Re-summon, read editor text, press Esc, hide.

**Expected:**
- On re-summon, the editor does NOT contain "once and done".
- Library still has exactly 1 card.

---

### Promote / Filter composition <a id="cross-window-promote-filter-composition"></a>

#### [P1] Promote while Library is filtered to "Pinned": note is created but not visible until filter is removed

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote while the Library is filtered to Pinned still creates the note (visible after switching back)`
- **Type**: race

**Steps:**
1. Seed a pinned note "seed pinned".
2. Switch sidebar filter to "Закреплённые" → 1 card.
3. Summon Draft, type "promoted while filtered", ⌘↵.
4. Switch filter back to "Все заметки".

**Expected:**
- With Pinned filter active: still 1 card (the promoted note is unpinned).
- With All filter active: 2 cards. Pinned-first order: seed first,
- promoted second.

---

### Promote / Markdown <a id="cross-window-promote-markdown"></a>

#### [P1] Promote preserves multi-line markdown body (headings, lists, blockquote)

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote with multi-line markdown content preserves the full body`
- **Type**: positive

**Steps:**
1. Summon Draft.
2. Paste a markdown body with heading, bullets and a blockquote.
3. Press ⌘↵.
4. Click the new card; wait for the editor text.

**Expected:**
- Editor contains the heading, a bullet item, and the blockquote text.

---

### Promote / Race <a id="cross-window-promote-race"></a>

#### [P1] Three back-to-back promotes create three distinct Library notes in newest-first order

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote three times in a row creates three distinct Library notes`
- **Type**: race

**Steps:**
1. Loop 3 times: summon, type a unique body, ⌘↵.

**Expected:**
- 3 cards present; the newest promote is on top, oldest at the bottom.

---

### Promote / Search composition <a id="cross-window-promote-search-composition"></a>

#### [P1] Promote while Library has an active search: card is added to the dataset

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote while the Library is in a search view sends the note into the dataset`
- **Type**: race

**Steps:**
1. Seed "apple seed" and apply search "apple" → 1 card.
2. Promote a Draft with body "promoted-banana".
3. While search is still "apple": cards count stays 1.
4. Change query to "banana" → 1 card containing "promoted-banana".

**Expected:**
- Promoted note enters the dataset and is searchable.

---

### Promote / Selection stability <a id="cross-window-promote-selection-stability"></a>

#### [P0] Library editor selection survives a Draft promote landing in the list

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `Library editor open while Draft promotes: list refreshes without losing the active selection`
- **Type**: race

**Steps:**
1. In Library: ⌘N, type "working on this", wait for the card title.
2. Summon Draft, type "arrives from draft", ⌘↵.

**Expected:**
- Library shows 2 cards.
- Library editor still shows "working on this".
- The card with `aria-current="true"` contains "working on this".

---

### Promote / Title derivation <a id="cross-window-promote-title-derivation"></a>

#### [P1] Promoted note's title is derived from the first line of the body

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `promote returns a note whose title is derived from the first line of the body`
- **Type**: positive

**Steps:**
1. Summon Draft.
2. Paste "Quick title\nbody body body".
3. ⌘↵.

**Expected:**
- 1 card; title contains "Quick title".
- Title does NOT contain "body body".

---

### Promote / Validation <a id="cross-window-promote-validation"></a>

#### [P0] Empty Draft on ⌘↵ does not create a Library note

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `empty Draft on ⌘↵ does not create a Library note`
- **Type**: negative

**Steps:**
1. Summon Draft.
2. Without typing anything, press ⌘↵.

**Expected:**
- Library still has 0 cards.

---

#### [P1] Whitespace-only Draft on ⌘↵ does not create a Library note

- **File**: `e2e/cross-window/draft-promote.spec.ts`
- **Test**: `whitespace-only Draft on ⌘↵ does not create a Library note`
- **Type**: negative

**Steps:**
1. Summon Draft.
2. Type whitespace + tabs + newlines, wait past autosave, press ⌘↵.

**Expected:**
- Library still has 0 cards.

---

### Security / Content-Security-Policy <a id="cross-window-security-content-security-policy"></a>

#### [P0] Both windows enforce the CSP: inline scripts are blocked, editor and inline styles work without violations

- **File**: `e2e/cross-window/csp.spec.ts`
- **Test**: `both windows enforce the renderer CSP without breaking the editor`
- **Type**: positive

**Steps:**
1. Launch app; read the CSP meta tag in Library.
2. Record `securitypolicyviolation` events in Library.
3. Append an inline `<script>` that sets a window flag.
4. Create a note and type into the CodeMirror editor.
5. Summon Draft; repeat steps 1–3 there and type into its editor.

**Expected:**
- The meta tag exists in both windows with `script-src 'self'` and no
- `'unsafe-inline'` / `'unsafe-eval'` for scripts.
- The inline script does not execute.
- The editor renders the typed text; the only recorded violation is
- the deliberate inline script.

---

### Storage fallback (bug #03) <a id="cross-window-storage-fallback-bug-03"></a>

#### [P0] Healthy launch shows no storage warning in Library or Draft

- **File**: `e2e/cross-window/storage-fallback.spec.ts`
- **Test**: `a healthy launch shows no storage warning anywhere`
- **Type**: negative

**Steps:**
1. Launch on a fresh userData dir.
2. Summon Draft, then pin it.

**Expected:**
- No "not saved" banner in Library.
- No "not saved" strip in Draft, unpinned or pinned.

---

#### [P0] Unopenable database: Library shows a non-dismissable banner with the reason

- **File**: `e2e/cross-window/storage-fallback.spec.ts`
- **Test**: `Library shows the "not saved" banner with a reason; no dismiss control`
- **Type**: negative

**Steps:**
1. Replace `userData/inmemnote.db` with a directory and launch.

**Expected:**
- The Library shows an alert saying notes are not saved, with a
- "Причина: …" part that names the failure (non-empty).
- The banner has no button, so it cannot be dismissed.
- The Library still works for the session: a new note can be created.

---

#### [P0] Unopenable database: Draft shows the one-line strip, full and pinned

- **File**: `e2e/cross-window/storage-fallback.spec.ts`
- **Test**: `Draft shows the "not saved" strip in both full and pinned modes`
- **Type**: negative

**Steps:**
1. Replace `userData/inmemnote.db` with a directory and launch.
2. Summon Draft, then pin it.

**Expected:**
- The Draft shows the "Не сохраняется: хранилище недоступно" strip.
- After pinning (compact 320 px layout) the strip is still visible.

---

#### [P2] The warning is truthful: notes written under the fallback are gone after a restart

- **File**: `e2e/cross-window/storage-fallback.spec.ts`
- **Test**: `notes written under the fallback do not survive a restart`
- **Type**: persistence

**Steps:**
1. Launch on an unopenable database, create a note "Ephemeral".
2. Quit and relaunch on the same userData (still unopenable).

**Expected:**
- Before the restart the note is listed and the banner is up.
- After the restart the Library is empty and the banner is up again.

---

### Storage fallback / Write failure (ADR 0008) <a id="cross-window-storage-fallback-write-failure-adr-0008"></a>

#### [P1] A database that disappears while the app runs raises the banner in both windows

- **File**: `e2e/cross-window/storage-fallback.spec.ts`
- **Test**: `deleting the DB file under a running app raises the banner without a restart`
- **Type**: negative

**Steps:**
1. Launch healthy; summon Draft (no warning in either window).
2. Delete `userData/inmemnote.db` from disk while the app runs.
3. Create a note in the Library (a write).

**Expected:**
- The write is detected as not persisted: the Library banner and the
- Draft strip both appear without a restart (`storage:changed` push).

---

## Visual

### Design tokens / Bootstrap <a id="visual-design-tokens-bootstrap"></a>

#### [P0] Renderer applies design tokens (accent, panel) and Tailwind utilities; Draft overlay screenshot is produced

- **File**: `e2e/visual-smoke.spec.ts`
- **Test**: `renderer applies design tokens and Tailwind utilities`
- **Type**: positive

**Steps:**
1. Launch app (unpackaged), grab the first window.
2. Read CSS custom properties on `:root` (`--accent`, `--panel`, …).
3. Take a full-page screenshot of Library, then summon Draft and screenshot it.

**Expected:**
- `--accent` resolves to `#3f7d6b` (brand accent).
- `--panel` is non-empty (token CSS loaded).
- `#root` innerHTML length > 100 (React mounted content).

**Notes:**
- Screenshots land in `test-results/`; they are visual regression aids,
- not assertions.

---

## Settings

### Entry / Exit <a id="settings-entry-exit"></a>

#### [P1] Gear button opens the Settings modal; Save is disabled until something changes

- **File**: `e2e/settings/popup.spec.ts`
- **Test**: `gear button opens the modal with three sections and a disabled Save`
- **Type**: positive

**Preconditions:**
- Fresh userData, Library window open, UI in Russian (`--lang=ru`).

**Steps:**
1. Verify no dialog is present.
2. Click the gear button in the Library toolbar ("Настройки").

**Expected:**
- A modal dialog "Настройки" becomes visible with the three sections
- Палитра / Хоткеи / Язык in its navigation.
- "Сохранить" is disabled (the form equals the persisted state).
- The first section (Палитра) is shown: theme switcher is visible.

---

#### [P1] Esc closes the Settings modal and discards an unsaved change

- **File**: `e2e/settings/popup.spec.ts`
- **Test**: `Esc closes the modal and drops unsaved edits`
- **Type**: positive

**Preconditions:**
- Fresh userData, Library window open.

**Steps:**
1. Open Settings.
2. Switch the theme to a different mode (live preview) so the form is dirty.
3. Press Escape.
4. Re-open Settings.

**Expected:**
- The dialog disappears after Esc.
- Re-opened, the form is clean again: "Сохранить" is disabled.
- Persisted `themeMode` is still `system`.

---

#### [P1] Clicking the dim layer closes the modal; clicking inside the dialog does not

- **File**: `e2e/settings/popup.spec.ts`
- **Test**: `dim-layer click closes the modal, an inside click does not`
- **Type**: positive

**Preconditions:**
- Fresh userData, Library window open.

**Steps:**
1. Open Settings.
2. Click on the dialog's title area (inside the panel).
3. Click on the dim layer in the window corner (outside the panel).

**Expected:**
- After step 2 the dialog is still visible.
- After step 3 the dialog is gone.

---

#### [P2] Header ✕ and footer "Отмена" both close the modal without saving

- **File**: `e2e/settings/popup.spec.ts`
- **Test**: `header close and footer Cancel buttons close the modal`
- **Type**: positive

**Preconditions:**
- Fresh userData, Library window open.

**Steps:**
1. Open Settings, click the header "Закрыть" (✕).
2. Open Settings again, click the footer "Отмена".

**Expected:**
- The dialog closes after each action.

---

### Hotkey <a id="settings-hotkey"></a>

#### [P0] A captured hotkey is saved and shown after reopening the popup and after restart

- **File**: `e2e/settings/hotkey.spec.ts`
- **Test**: `captured hotkey persists across popup reopen and restart`
- **Type**: persistence

**Preconditions:**
- Fresh userData (default hotkey ⌘ ⇧ Space).

**Steps:**
1. Open Settings → Хоткеи; the default combo is displayed.
2. Click "Изменить…", press Ctrl+Option+K.
3. Click "Сохранить".
4. Re-open Settings → Хоткеи.
5. Close the app, launch it again on the same userData, open Settings → Хоткеи.

**Expected:**
- After step 2: the display shows "⌃ ⌥ K" and capture mode is over; "Сохранить" is enabled.
- After step 3: main persisted `Control+Option+K`.
- After steps 4 and 5: the display still shows "⌃ ⌥ K".

---

#### [P1] Modifier-only presses are ignored and Esc aborts capture, keeping the old hotkey

- **File**: `e2e/settings/hotkey.spec.ts`
- **Test**: `modifier-only keys are ignored and Esc aborts the capture`
- **Type**: negative

**Preconditions:**
- Fresh userData.

**Steps:**
1. Open Settings → Хоткеи, click "Изменить…".
2. Press Shift alone.
3. Press Escape.

**Expected:**
- After step 2: still capturing ("Нажмите комбинацию клавиш…" visible), no value change.
- After step 3: capture ends, the default "⌘ ⇧ Space" is displayed, the Settings dialog
- is still open (Esc was consumed by the capture) and "Сохранить" is disabled.

---

#### [P1] A captured but unsaved hotkey is discarded when the popup is cancelled

- **File**: `e2e/settings/hotkey.spec.ts`
- **Test**: `cancel discards a captured hotkey`
- **Type**: negative

**Preconditions:**
- Fresh userData.

**Steps:**
1. Open Settings → Хоткеи, capture Ctrl+Option+K.
2. Click the footer "Отмена".
3. Re-open Settings → Хоткеи.

**Expected:**
- The default "⌘ ⇧ Space" is displayed again and main still stores the default.

---

#### [P1] Main rejects an invalid accelerator and keeps the previous hotkey

- **File**: `e2e/settings/hotkey.spec.ts`
- **Test**: `invalid accelerators are rejected by main and the old value stays`
- **Type**: negative

**Preconditions:**
- Fresh userData.

**Steps:**
1. From the Library renderer call `settings.save({ openDraftHotkey })` over the
2. preload bridge with "Shift" (modifier only), then with "Bogus+K" (unknown token).
3. Open Settings → Хоткеи.

**Expected:**
- Both calls are rejected with an "Invalid hotkey" message.
- `settings.load()` and the popup still show the default ⌘ ⇧ Space.

**Notes:**
- The capture UI cannot emit such values (it only maps keys from the allow-list and
- ignores modifier-only presses), so the rejection path is exercised at the IPC
- boundary instead of through the keyboard.

---

### Language <a id="settings-language"></a>

#### [P0] Switching to English retranslates Library, sets html lang and survives restart

- **File**: `e2e/settings/language.spec.ts`
- **Test**: `English retranslates the Library, sets html lang and persists`
- **Type**: persistence

**Preconditions:**
- Fresh userData, launched with `--lang=ru` (language mode "system" → Russian).

**Steps:**
1. Verify Russian: toolbar button "Новая", `<html lang="ru">`.
2. Open Settings → Язык, pick "English", click "Сохранить".
3. Close the app, launch it again on the same userData.

**Expected:**
- After step 2: toolbar shows "New", gear is named "Settings", sidebar shows "All notes",
- `<html lang="en">`; main persisted `language: "en"`.
- After step 3: the Library boots in English with `<html lang="en">`.

---

#### [P1] An open Draft window switches language after a save in Library

- **File**: `e2e/settings/language.spec.ts`
- **Test**: `saved language is picked up by an open Draft window`
- **Type**: positive

**Preconditions:**
- Fresh userData, `--lang=ru`; the Draft window has been summoned.

**Steps:**
1. Verify the Draft header reads "Быстрая заметка".
2. In Library open Settings → Язык, pick "English", save.

**Expected:**
- The Draft header now reads "Quick note" with no action in the Draft window.

---

#### [P1] Switching back to "Системный" returns the UI to the OS language (Russian)

- **File**: `e2e/settings/language.spec.ts`
- **Test**: `"system" returns the UI to Russian`
- **Type**: positive

**Preconditions:**
- Fresh userData, `--lang=ru`; "English" already saved (UI is English).

**Steps:**
1. Open Settings ("Settings") → Language, pick "System", click "Save".

**Expected:**
- Toolbar reads "Новая" again, `<html lang="ru">`, main persisted `language: "system"`.

---

#### [P2] An unsaved language choice is not applied and is rolled back on Cancel

- **File**: `e2e/settings/language.spec.ts`
- **Test**: `cancel leaves the language untouched`
- **Type**: negative

**Preconditions:**
- Fresh userData, `--lang=ru`.

**Steps:**
1. Open Settings → Язык, pick "English" without saving.
2. Click the footer "Отмена".

**Expected:**
- Library strings stay Russian throughout, `<html lang="ru">` after Cancel,
- and main still stores `language: "system"`.

---

### Palette <a id="settings-palette"></a>

#### [P0] Saved colour persists across restart and reaches an open Draft window

- **File**: `e2e/settings/palette.spec.ts`
- **Test**: `saved accent persists across restart and reaches the Draft window`
- **Type**: persistence

**Preconditions:**
- Fresh userData; the Draft window has been summoned.

**Steps:**
1. In Library open Settings, set "accent" to #ff0000, click "Сохранить".
2. Close the app and launch it again on the same userData.
3. Summon Draft.

**Expected:**
- After step 1: Library and the already-open Draft both carry inline
- `--accent: #ff0000`; the DB palette is `{ accent: "#ff0000" }`.
- After step 2: Library has the override without opening Settings.
- After step 3: the (new) Draft window has it as well.

---

#### [P1] Colour change previews live and Esc restores the persisted palette

- **File**: `e2e/settings/palette.spec.ts`
- **Test**: `accent previews live and Esc rolls it back`
- **Type**: positive

**Preconditions:**
- Fresh userData (no overrides).

**Steps:**
1. Note the resolved `--accent` (theme default).
2. Open Settings, set the "accent" picker to #ff0000.
3. Click the dialog title (moves focus off the colour input) and press Escape.

**Expected:**
- After step 2: `--accent` resolves to #ff0000 immediately, nothing is
- persisted yet (palette in the DB is empty).
- After step 3: no inline `--accent` is left and the resolved value is
- the original theme default again.

---

#### [P1] Per-token "Сброс" returns only that token to the theme default

- **File**: `e2e/settings/palette.spec.ts`
- **Test**: `Reset returns one token to the theme default and keeps the others`
- **Type**: positive

**Preconditions:**
- Fresh userData; "accent" = #ff0000 and "text" = #00ff00 are saved.

**Steps:**
1. Re-open Settings → Палитра; "Сброс" is enabled for accent and text.
2. Click "Сброс" on the accent row.
3. Click "Сохранить".

**Expected:**
- "Сброс" is disabled for tokens without an override (e.g. panel).
- After step 2: inline `--accent` is gone at once (live), `--text` keeps
- its override, and the accent resolves to the original theme default.
- After step 3: the DB palette is `{ text: "#00ff00" }`.

---

#### [P2] Footer Cancel after a colour change also rolls the palette back

- **File**: `e2e/settings/palette.spec.ts`
- **Test**: `Cancel button rolls an unsaved colour back`
- **Type**: negative

**Preconditions:**
- Fresh userData.

**Steps:**
1. Open Settings, set "text" to #00ff00 (live preview).
2. Click the footer "Отмена".

**Expected:**
- Inline `--text` is cleared and nothing is persisted.

---

### Theme <a id="settings-theme"></a>

#### [P0] Saved theme survives an app restart

- **File**: `e2e/settings/theme.spec.ts`
- **Test**: `saved theme is applied again after restart`
- **Type**: persistence

**Preconditions:**
- Fresh userData.

**Steps:**
1. Open Settings, pick "Светлая", click "Сохранить".
2. Close the app and launch it again on the same userData.
3. Open Settings, pick "Тёмная", click "Сохранить".
4. Restart once more.

**Expected:**
- After step 1: popup closed, `data-theme="light"`.
- After step 2: `data-theme="light"` without opening Settings.
- After step 4: `data-theme="dark"` (so the value is read from the DB,
- not from a stale default).

---

#### [P1] Theme choice previews live and is rolled back by Esc

- **File**: `e2e/settings/theme.spec.ts`
- **Test**: `theme previews live and Esc rolls it back to the persisted value`
- **Type**: positive

**Preconditions:**
- Fresh userData (theme mode = system).

**Steps:**
1. Note the current `data-theme` (dark or light, from the OS).
2. Open Settings, pick the opposite explicit mode.
3. Press Escape.

**Expected:**
- After step 2 `<html data-theme>` flips immediately, with nothing saved
- (persisted `themeMode` is still `system`).
- After step 3 the original `data-theme` is restored.

---

#### [P1] A saved theme reaches an already-open Draft window (settings:changed broadcast)

- **File**: `e2e/settings/theme.spec.ts`
- **Test**: `saved theme is broadcast to an open Draft window`
- **Type**: positive

**Preconditions:**
- Fresh userData; the Draft window has been summoned.

**Steps:**
1. In Library, open Settings, pick "Тёмная", save.
2. In Library, open Settings, pick "Светлая", save.

**Expected:**
- The Draft window's `data-theme` follows each save (dark, then light),
- without any action in the Draft window.

---

### Update banner <a id="settings-update-banner"></a>

#### [P2] A broadcast release shows the banner with its version; "Позже" hides it

- **File**: `e2e/settings/update-banner.spec.ts`
- **Test**: `banner shows the announced version and "Later" dismisses it`
- **Type**: positive

**Preconditions:**
- Fresh userData; update check is disabled under E2E, so no banner at start.

**Steps:**
1. Verify the banner is absent.
2. From main, send `update:available` { version: "99.1.0", … } to the Library webContents.
3. Click "Позже".

**Expected:**
- After step 2 a status region announces "Доступна версия 99.1.0" and offers
- "Что нового" (linking to the release notes), "Позже" and "Обновить и перезапустить".
- After step 3 the banner disappears.

---

#### [P2] A dismissed banner re-surfaces on the next announcement and follows the UI language

- **File**: `e2e/settings/update-banner.spec.ts`
- **Test**: `dismissed banner re-surfaces with the newer version and is translated`
- **Type**: edge

**Preconditions:**
- Fresh userData, `--lang=ru`.

**Steps:**
1. Broadcast release 99.1.0, click "Позже".
2. Broadcast release 99.2.0.
3. Switch the UI language to English in Settings → Язык and save.

**Expected:**
- After step 2 the banner is back and names 99.2.0 (not the dismissed 99.1.0).
- After step 3 the same banner reads "Version 99.2.0 is available" with the
- "Later" / "Update & restart" buttons.

---

