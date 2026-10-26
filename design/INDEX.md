# Design index

> Owned by the `ux-designer` agent. One row per surface. Update the row
> after every design change. A surface without an entry here is invisible
> to the rest of the agents — they will not find its mockup.

## Format

`status` ∈ { `concept` | `wip` | `approved` | `superseded` }.

## Surfaces

| Surface | Owning mockup | Status | Last reviewed | Notes |
|---|---|---|---|---|
| Concept overview | `Inmemnote - Концепт (вайрфреймы).html` | approved | 2026-06-10 | wireframes / vision |
| Draft (hi-fi) | `Inmemnote - Draft (hi-fi).html` | approved | 2026-06-10 | **source of truth for palette, typography, spacing** |
| Draft & Pin prototype | `Inmemnote - Draft & Pin (прототип).html` | wip | 2026-06-10 | interaction prototype |
| Library prototype | `Inmemnote - Library (прототип).html` | wip | 2026-06-10 | |
| Library standalone | `Inmemnote-Library-standalone.html` | wip | 2026-06-10 | extracted standalone view |
| Library — delete Undo toast | spec only (no mockup); tokens from `Inmemnote - Draft (hi-fi).html` (`.seltoolbar` floating surface) | wip | 2026-10-22 | soft delete + 6 s "Note deleted · Undo" toast, bottom of list column; `--bar` bg, solid-accent Undo, polite live region, ⌘Z only outside text fields |

## Tokens (canonical values)

- **Accent**: `#3f7d6b` (green). No other accents.
- **Grid**: 4 px. Every spacing / size is `n × 4`.
- **Themes**: dark (primary), light (secondary).

For full token values consult `Inmemnote - Draft (hi-fi).html`.

## Screenshots

Reference screenshots from the customer live in `screenshots/`. Treat
them as ground truth for visual decisions when they conflict with older
mockups.
