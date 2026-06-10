# Inmemnote — E2E regression test plan

> Auto-generated from JSDoc in `e2e/**/*.spec.ts`.
> Do NOT edit by hand — run `npm run gen:test-plan` to refresh.
> CI fails if this file is out of sync with the source specs.

## Summary

- Total scenarios: **75**
- By priority: **P0** = 27, **P1** = 43, **P2** = 5
- By type: **positive** = 37, **negative** = 11, **edge** = 10, **race** = 11, **persistence** = 6
- By area: **Cross-window** = 10, **Draft** = 34, **Library** = 30, **Visual** = 1

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
  - [Title derivation](#library-title-derivation) (1)
- [Cross-window](#cross-window)
  - [Promote](#cross-window-promote) (1)
  - [Promote / Buffer cleanup](#cross-window-promote-buffer-cleanup) (1)
  - [Promote / Filter composition](#cross-window-promote-filter-composition) (1)
  - [Promote / Markdown](#cross-window-promote-markdown) (1)
  - [Promote / Race](#cross-window-promote-race) (1)
  - [Promote / Search composition](#cross-window-promote-search-composition) (1)
  - [Promote / Selection stability](#cross-window-promote-selection-stability) (1)
  - [Promote / Title derivation](#cross-window-promote-title-derivation) (1)
  - [Promote / Validation](#cross-window-promote-validation) (2)
- [Visual](#visual)
  - [Design tokens / Bootstrap](#visual-design-tokens-bootstrap) (1)

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

