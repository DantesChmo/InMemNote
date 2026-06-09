import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DraftHeader } from './DraftHeader';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

// We only test DraftHeader in isolation — `useTranslation` is mocked so we
// don't have to spin up the Redux store / settings slice just to read strings.
vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({
    locale: 'en' as const,
    t: (key: string) => key,
  }),
}));

describe('DraftHeader', () => {
  let api: InmemnoteAPI;

  beforeEach(() => {
    api = installInmemnoteApiMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title and pin button labeled "draft.pin" when not pinned', () => {
    render(<DraftHeader pinned={false} onTogglePin={vi.fn()} />);

    expect(screen.getByText('draft.title')).toBeInTheDocument();
    const pinBtn = screen.getByTestId('draft-pin-btn');
    expect(pinBtn).toHaveAttribute('aria-label', 'draft.pin');
  });

  it('uses "draft.unpin" aria-label and a drag region in pinned mode', () => {
    render(<DraftHeader pinned={true} onTogglePin={vi.fn()} />);

    const pinBtn = screen.getByTestId('draft-pin-btn');
    expect(pinBtn).toHaveAttribute('aria-label', 'draft.unpin');
    // The strip container is the parent of the icon — locate by class includes "draft-drag".
    const strip = pinBtn.parentElement!;
    expect(strip.className).toContain('draft-drag');
  });

  it('hides the reset button unless pinned AND onResetPinSize is provided', () => {
    const { rerender } = render(
      <DraftHeader pinned={false} onTogglePin={vi.fn()} onResetPinSize={vi.fn()} />,
    );
    expect(screen.queryByTestId('draft-reset-size-btn')).toBeNull();

    rerender(<DraftHeader pinned={true} onTogglePin={vi.fn()} />);
    expect(screen.queryByTestId('draft-reset-size-btn')).toBeNull();

    rerender(<DraftHeader pinned={true} onTogglePin={vi.fn()} onResetPinSize={vi.fn()} />);
    expect(screen.getByTestId('draft-reset-size-btn')).toBeInTheDocument();
  });

  it('invokes onTogglePin / onResetPinSize on click', () => {
    const onTogglePin = vi.fn();
    const onResetPinSize = vi.fn();
    render(
      <DraftHeader pinned={true} onTogglePin={onTogglePin} onResetPinSize={onResetPinSize} />,
    );

    fireEvent.click(screen.getByTestId('draft-pin-btn'));
    fireEvent.click(screen.getByTestId('draft-reset-size-btn'));

    expect(onTogglePin).toHaveBeenCalledTimes(1);
    expect(onResetPinSize).toHaveBeenCalledTimes(1);
  });

  it('subscribes to header hover IPC and applies hover background while pinned', () => {
    let push: ((hovering: boolean) => void) | null = null;
    (api.draft.onHeaderHover as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (hovering: boolean) => void) => {
        push = h;
        return () => undefined;
      },
    );

    render(<DraftHeader pinned={true} onTogglePin={vi.fn()} />);

    expect(api.draft.onHeaderHover).toHaveBeenCalledTimes(1);
    expect(push).not.toBeNull();

    act(() => push!(true));
    const strip = screen.getByTestId('draft-pin-btn').parentElement!;
    expect(strip.style.background).toContain('color-mix');
  });

  it('drops the stuck hover when the panel transitions to un-pinned', () => {
    let push: ((hovering: boolean) => void) | null = null;
    (api.draft.onHeaderHover as ReturnType<typeof vi.fn>).mockImplementation(
      (h: (hovering: boolean) => void) => {
        push = h;
        return () => undefined;
      },
    );

    const { rerender } = render(<DraftHeader pinned={true} onTogglePin={vi.fn()} />);
    act(() => push!(true));
    rerender(<DraftHeader pinned={false} onTogglePin={vi.fn()} />);
    const strip = screen.getByTestId('draft-pin-btn').parentElement!;
    // After un-pin the background style should be gone.
    expect(strip.style.background).toBe('');
  });
});
