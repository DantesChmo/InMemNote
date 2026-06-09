import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ResizeHandle } from './ResizeHandle';

import { installInmemnoteApiMock } from '../../test/mockInmemnoteApi';

import type { InmemnoteAPI } from '@infrastructure/electron/preload/index';

describe('ResizeHandle', () => {
  let api: InmemnoteAPI;

  beforeEach(() => {
    api = installInmemnoteApiMock();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders an opaque hit area on the corner opposite the pin anchor', () => {
    const { rerender } = render(<ResizeHandle pinnedCorner="tr" />);
    const handle = screen.getByTestId('draft-resize-handle');

    expect(handle.style.bottom).toBe('0px');
    expect(handle.style.left).toBe('0px');
    expect(handle.style.cursor).toBe('nesw-resize');
    expect(handle.style.opacity).toBe('0');

    rerender(<ResizeHandle pinnedCorner="bl" />);
    expect(handle.style.top).toBe('0px');
    expect(handle.style.right).toBe('0px');
    expect(handle.style.cursor).toBe('nesw-resize');
  });

  it('uses nwse-resize for diagonal opposites tl/br', () => {
    const { rerender } = render(<ResizeHandle pinnedCorner="tl" />);
    let handle = screen.getByTestId('draft-resize-handle');
    expect(handle.style.bottom).toBe('0px');
    expect(handle.style.right).toBe('0px');
    expect(handle.style.cursor).toBe('nwse-resize');

    rerender(<ResizeHandle pinnedCorner="br" />);
    handle = screen.getByTestId('draft-resize-handle');
    expect(handle.style.top).toBe('0px');
    expect(handle.style.left).toBe('0px');
    expect(handle.style.cursor).toBe('nwse-resize');
  });

  it('invokes beginResize via IPC on mouse-down and prevents default', () => {
    render(<ResizeHandle pinnedCorner="tr" />);

    const handle = screen.getByTestId('draft-resize-handle');
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    const prevented = !handle.dispatchEvent(event);

    expect(prevented).toBe(true);
    expect(api.draft.beginResize).toHaveBeenCalledTimes(1);
  });

  it('does not call beginResize if the event does not actually fire', () => {
    render(<ResizeHandle pinnedCorner="tr" />);
    // No interaction — nothing should be called.
    expect(api.draft.beginResize).not.toHaveBeenCalled();
  });

  it('attaches preventDefault to fireEvent.mouseDown wrapper', () => {
    render(<ResizeHandle pinnedCorner="tr" />);
    const handle = screen.getByTestId('draft-resize-handle');
    fireEvent.mouseDown(handle);
    expect(api.draft.beginResize).toHaveBeenCalled();
  });
});
