import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DraftFooter } from './DraftFooter';

describe('DraftFooter', () => {
  it('renders the Markdown label and keyboard hints', () => {
    render(<DraftFooter />);

    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('esc')).toBeInTheDocument();
    expect(screen.getByText('⌘ ↵')).toBeInTheDocument();
  });
});
