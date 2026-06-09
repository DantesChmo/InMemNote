import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@presentation/draft/DraftPanel', () => ({
  DraftPanel: () => <div data-testid="stub-draft-panel" />,
}));

vi.mock('@presentation/library/LibraryWindow', () => ({
  LibraryWindow: () => <div data-testid="stub-library-window" />,
}));

vi.mock('./store', () => ({
  store: { getState: () => ({}), subscribe: () => () => undefined, dispatch: () => undefined },
}));

import { App } from './App';

describe('App (shallow)', () => {
  const originalLocation = window.location;

  const setSearch = (search: string): void => {
    // jsdom location is read-only via assignment; replace the descriptor.
    Object.defineProperty(window, 'location', {
      value: new URL(`http://localhost/${search}`),
      configurable: true,
    });
  };

  beforeEach(() => undefined);
  afterEach(() => {
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  it('renders the library window by default', () => {
    setSearch('?view=library');
    render(<App />);
    expect(screen.getByTestId('stub-library-window')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-draft-panel')).toBeNull();
  });

  it('renders the draft panel when ?view=draft', () => {
    setSearch('?view=draft');
    render(<App />);
    expect(screen.getByTestId('stub-draft-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('stub-library-window')).toBeNull();
  });

  it('falls back to library when ?view is missing', () => {
    setSearch('');
    render(<App />);
    expect(screen.getByTestId('stub-library-window')).toBeInTheDocument();
  });
});
