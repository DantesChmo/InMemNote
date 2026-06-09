// Unit tests for previewOf. Pure function — no React, no store, no IPC.
import { describe, expect, it } from 'vitest';

import { previewOf } from './preview';

describe('previewOf', () => {
  it('returns an empty string when there is no body line', () => {
    expect(previewOf('')).toBe('');
    expect(previewOf('Title only')).toBe('');
  });

  it('drops the first line (treated as title) and returns the rest', () => {
    expect(previewOf('Title\nbody')).toBe('body');
  });

  it('joins multiple body lines with two spaces', () => {
    expect(previewOf('Title\nfirst\nsecond\nthird')).toBe('first  second  third');
  });

  it('filters out lines that are blank after trimming', () => {
    expect(previewOf('Title\nfirst\n\n   \nsecond')).toBe('first  second');
  });

  describe('marker stripping', () => {
    it.each([
      ['# heading', 'heading'],
      ['## heading', 'heading'],
      ['###### heading', 'heading'],
    ])('strips ATX heading markers (%s)', (input, expected) => {
      expect(previewOf(`Title\n${input}`)).toBe(expected);
    });

    it('leaves seven hashes alone (the regex requires whitespace right after 1–6 hashes)', () => {
      // `^#{1,6}\s+` against `####### deep`: after any 1–6 leading `#`, the
      // next char is still `#`, never whitespace, so no match → no stripping.
      expect(previewOf('Title\n####### deep')).toBe('####### deep');
    });

    it.each([
      ['- item', '• item'],
      ['* item', '• item'],
      ['+ item', '• item'],
    ])('converts unordered list markers to a bullet (%s)', (input, expected) => {
      expect(previewOf(`Title\n${input}`)).toBe(expected);
    });

    it.each([
      ['1. item', 'item'],
      ['12. item', 'item'],
      ['1) item', 'item'],
    ])('strips ordered list markers (%s)', (input, expected) => {
      expect(previewOf(`Title\n${input}`)).toBe(expected);
    });

    it('strips blockquote markers', () => {
      expect(previewOf('Title\n> quoted')).toBe('quoted');
    });

    it('unwraps **bold** inline', () => {
      expect(previewOf('Title\nmake **this** bold')).toBe('make this bold');
    });

    it('unwraps multiple bold spans on the same line non-greedily', () => {
      expect(previewOf('Title\n**a** and **b**')).toBe('a and b');
    });

    it('unwraps _italic_ inline', () => {
      expect(previewOf('Title\nmake _that_ italic')).toBe('make that italic');
    });

    it('unwraps `code` inline', () => {
      expect(previewOf('Title\nrun `npm ci` now')).toBe('run npm ci now');
    });

    it('combines marker stripping on the same line', () => {
      expect(previewOf('Title\n- **bold** _it_ `code`')).toBe('• bold it code');
    });

    it('only strips block markers at the very start of a line', () => {
      // A `#` mid-line is plain text, not a heading marker.
      expect(previewOf('Title\nuse # not ##')).toBe('use # not ##');
    });
  });

  it('joins body lines that have been transformed by stripMarkers', () => {
    const body = ['Title', '# Heading', '- one', '- two', '> quote'].join('\n');
    expect(previewOf(body)).toBe('Heading  • one  • two  quote');
  });

  it('preserves a line that is just whitespace after stripping as filtered out', () => {
    // `#` followed by only spaces would not match `^#{1,6}\s+\S` (the regex
    // requires *something* after the space because `replace` keeps the line),
    // but after the marker is stripped the line is empty and should be dropped.
    expect(previewOf('Title\n#   \nreal')).toBe('real');
  });
});
