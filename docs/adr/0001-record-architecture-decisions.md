# ADR 0001 — Record architecture decisions

- **Status**: Accepted
- **Date**: 2026-06-10

## Context

The project is small but has strong architectural commitments (DDD layering,
no cloud, fixed stack — see `CLAUDE.md` §1–§4). As the codebase grows we
need a durable record of *why* a given decision was made, so future readers
(and agents) can distinguish accidental shape from intentional design.

## Decision

We adopt **Architecture Decision Records** in Michael Nygard's format:

- One ADR per non-trivial decision.
- File name: `docs/adr/NNNN-<kebab-slug>.md`, NNNN zero-padded sequential.
- Sections: Context / Decision / Consequences. One page maximum.
- ADRs are **immutable** once accepted. A new decision that overrides an
  old one is a new ADR that references the old one; the old one is marked
  `Superseded by NNNN`.

The `architector` agent owns this directory.

## Consequences

- We pay a small cost per decision (writing one page).
- We gain a permanent record of intent that survives staff turnover and
  context-window limits.
- `docs/ARCHITECTURE.md` describes the *current* shape; ADRs describe *why*
  it is that shape.
