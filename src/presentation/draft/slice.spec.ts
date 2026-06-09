// Unit tests for the draft slice. The reducer is a pure function — we exercise
// every action against a known starting state and assert the next state.
// No React, no <Provider>, no IPC; component-level coverage of how UI dispatches
// these actions lives in the *.spec.tsx files next door.
import { describe, expect, it } from 'vitest';

import { draftActions, draftReducer, type DraftState } from './slice';

const initialState: DraftState = {
  id: null,
  content: '',
  pinned: false,
  updatedAt: null,
  loading: false,
};

function stateWith(overrides: Partial<DraftState>): DraftState {
  return { ...initialState, ...overrides };
}

describe('draftReducer', () => {
  it('returns the initial state for an unknown action', () => {
    const next = draftReducer(undefined, { type: '@@INIT' });
    expect(next).toEqual(initialState);
  });

  describe('setDraft', () => {
    it('replaces the in-memory draft from an IPC DTO and clears loading', () => {
      const previous = stateWith({ loading: true, content: 'stale' });

      const next = draftReducer(
        previous,
        draftActions.setDraft({
          id: 'draft-42',
          content: 'hello',
          pinned: true,
          updatedAt: '2026-06-09T12:00:00.000Z',
        }),
      );

      expect(next).toEqual<DraftState>({
        id: 'draft-42',
        content: 'hello',
        pinned: true,
        updatedAt: '2026-06-09T12:00:00.000Z',
        loading: false,
      });
    });

    it('overwrites previous values rather than merging', () => {
      const previous = stateWith({
        id: 'old-id',
        content: 'old content',
        pinned: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });

      const next = draftReducer(
        previous,
        draftActions.setDraft({
          id: 'new-id',
          content: 'new content',
          pinned: false,
          updatedAt: '2026-06-09T00:00:00.000Z',
        }),
      );

      expect(next.id).toBe('new-id');
      expect(next.pinned).toBe(false);
    });
  });

  describe('editContent', () => {
    it('updates only the content field', () => {
      const previous = stateWith({
        id: 'draft-1',
        content: 'before',
        pinned: true,
        updatedAt: '2026-06-09T12:00:00.000Z',
      });

      const next = draftReducer(previous, draftActions.editContent('after'));

      expect(next).toEqual<DraftState>({
        ...previous,
        content: 'after',
      });
    });

    it('accepts an empty string', () => {
      const next = draftReducer(stateWith({ content: 'x' }), draftActions.editContent(''));
      expect(next.content).toBe('');
    });
  });

  describe('setLoading', () => {
    it.each([
      [true, false],
      [false, true],
    ])('toggles loading from %s to %s', (to, from) => {
      const next = draftReducer(stateWith({ loading: from }), draftActions.setLoading(to));
      expect(next.loading).toBe(to);
    });
  });

  describe('clear', () => {
    it('resets every field back to the initial state', () => {
      const populated = stateWith({
        id: 'draft-1',
        content: 'something',
        pinned: true,
        updatedAt: '2026-06-09T12:00:00.000Z',
        loading: true,
      });

      const next = draftReducer(populated, draftActions.clear());

      expect(next).toEqual(initialState);
    });
  });
});
