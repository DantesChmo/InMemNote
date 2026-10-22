import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Local structural mirror of the slice state — the component only reads it.
interface StorageState {
  degraded: Array<{ store: 'drafts' | 'notes' | 'settings'; reason: string }>;
}

let state: StorageState = { degraded: [] };

vi.mock('@presentation/app/store', () => ({
  useAppSelector: (sel: (s: { storage: StorageState }) => unknown) => sel({ storage: state }),
}));

vi.mock('@presentation/i18n/useTranslation', () => ({
  useTranslation: () => ({
    locale: 'en' as const,
    t: (k: string, p?: Record<string, unknown>) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}));

import { StorageBanner } from './StorageBanner';

describe('StorageBanner (shallow)', () => {
  beforeEach(() => {
    state = { degraded: [] };
  });
  afterEach(() => vi.restoreAllMocks());

  describe('full (Library)', () => {
    it('renders nothing while every store is persisted', () => {
      const { container } = render(<StorageBanner />);
      expect(container).toBeEmptyDOMElement();
    });

    it('warns that notes are lost on quit when notes are in memory', () => {
      state = { degraded: [{ store: 'notes', reason: 'SQLITE_CANTOPEN' }] };
      render(<StorageBanner />);
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('storage.notesNotSaved')).toBeInTheDocument();
    });

    it('treats a degraded drafts store as "notes are not saved" too', () => {
      state = {
        degraded: [
          { store: 'drafts', reason: 'x' },
          { store: 'settings', reason: 'x' },
        ],
      };
      render(<StorageBanner />);
      expect(screen.getByText('storage.notesNotSaved')).toBeInTheDocument();
      expect(screen.queryByText('storage.settingsNotSaved')).not.toBeInTheDocument();
    });

    it('uses the settings-only message when only settings fell back', () => {
      state = { degraded: [{ store: 'settings', reason: 'x' }] };
      render(<StorageBanner />);
      expect(screen.getByText('storage.settingsNotSaved')).toBeInTheDocument();
      expect(screen.queryByText('storage.notesNotSaved')).not.toBeInTheDocument();
    });

    it('shows the distinct reasons once each', () => {
      state = {
        degraded: [
          { store: 'drafts', reason: 'SQLITE_CANTOPEN' },
          { store: 'notes', reason: 'SQLITE_CANTOPEN' },
          { store: 'settings', reason: 'disk full' },
        ],
      };
      render(<StorageBanner />);
      expect(
        screen.getByText('storage.reason:{"reason":"SQLITE_CANTOPEN; disk full"}'),
      ).toBeInTheDocument();
    });

    it('is persistent — offers no way to dismiss it', () => {
      state = { degraded: [{ store: 'notes', reason: 'x' }] };
      render(<StorageBanner />);
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('compact (Draft)', () => {
    it('stays hidden when only settings are in memory — the draft text is safe', () => {
      state = { degraded: [{ store: 'settings', reason: 'x' }] };
      const { container } = render(<StorageBanner variant="compact" />);
      expect(container).toBeEmptyDOMElement();
    });

    it('shows a one-line warning with the reason as a tooltip when drafts are in memory', () => {
      state = { degraded: [{ store: 'drafts', reason: 'no native' }] };
      render(<StorageBanner variant="compact" />);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('storage.draftNotSaved');
      expect(alert).toHaveAttribute('title', 'storage.reason:{"reason":"no native"}');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('also warns when only notes are in memory — ⌘↵ promotes into them', () => {
      state = { degraded: [{ store: 'notes', reason: 'x' }] };
      render(<StorageBanner variant="compact" />);
      expect(screen.getByText('storage.draftNotSaved')).toBeInTheDocument();
    });
  });
});
