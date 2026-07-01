import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Local structural mirror of the slice state — the spec mocks `./slice`, so it
// deliberately doesn't import the real type (keeps the component import last).
interface UpdateState {
  available: { version: string; downloadUrl: string; notesUrl: string } | null;
  phase: 'idle' | 'checking' | 'downloading' | 'error';
  progress: number;
  error: string | null;
}

const dispatch = vi.fn();
let state: UpdateState = { available: null, phase: 'idle', progress: 0, error: null };

const dto = { version: '0.6.0', downloadUrl: 'https://x/0.6.0.dmg', notesUrl: 'https://x/notes' };

vi.mock('@presentation/app/store', () => ({
  useAppDispatch: () => dispatch,
  useAppSelector: (sel: (s: { update: UpdateState }) => unknown) => sel({ update: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({
    locale: 'en' as const,
    // Echo the key + any interpolation so tests can assert on both.
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}));

vi.mock('./slice', () => ({
  installUpdate: () => ({ type: 'update/install' }),
  updateActions: {
    dismiss: () => ({ type: 'update/dismiss' }),
  },
}));

import { UpdateBanner } from './UpdateBanner';

describe('UpdateBanner (shallow)', () => {
  beforeEach(() => {
    dispatch.mockClear();
    state = { available: null, phase: 'idle', progress: 0, error: null };
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing when no update is available', () => {
    const { container } = render(<UpdateBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the version and action buttons when an update is available', () => {
    state = { ...state, available: dto };
    render(<UpdateBanner />);
    expect(screen.getByText(/update\.available.*0\.6\.0/)).toBeInTheDocument();
    expect(screen.getByText('update.install')).toBeInTheDocument();
    expect(screen.getByText('update.later')).toBeInTheDocument();
  });

  it('dispatches installUpdate when the primary button is clicked', () => {
    state = { ...state, available: dto };
    render(<UpdateBanner />);
    fireEvent.click(screen.getByText('update.install'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'update/install' });
  });

  it('dispatches dismiss when "Later" is clicked', () => {
    state = { ...state, available: dto };
    render(<UpdateBanner />);
    fireEvent.click(screen.getByText('update.later'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'update/dismiss' });
  });

  it('shows a progress readout and hides buttons while downloading', () => {
    state = { available: dto, phase: 'downloading', progress: 0.42, error: null };
    render(<UpdateBanner />);
    expect(screen.getByText(/update\.downloading.*42/)).toBeInTheDocument();
    expect(screen.queryByText('update.install')).not.toBeInTheDocument();
  });

  it('shows the failure message but keeps the retry button on error', () => {
    state = { available: dto, phase: 'error', progress: 0, error: 'boom' };
    render(<UpdateBanner />);
    expect(screen.getByText('update.failed')).toBeInTheDocument();
    expect(screen.getByText('update.install')).toBeInTheDocument();
  });

  it('links to the release notes', () => {
    state = { ...state, available: dto };
    render(<UpdateBanner />);
    expect(screen.getByText('update.notes')).toHaveAttribute('href', dto.notesUrl);
  });
});
