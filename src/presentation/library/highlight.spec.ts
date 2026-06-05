import { describe, expect, it } from 'vitest';

import { highlightHTML } from './highlight';

describe('highlightHTML', () => {
  it('escapes HTML when no query is given', () => {
    expect(highlightHTML('<b>x</b>', '')).toBe('&lt;b&gt;x&lt;/b&gt;');
  });

  it('wraps the first match with <mark>', () => {
    expect(highlightHTML('Hello world', 'world')).toBe('Hello <mark class="lib-hl">world</mark>');
  });

  it('is case-insensitive and preserves original casing', () => {
    expect(highlightHTML('Hello WORLD', 'world')).toBe('Hello <mark class="lib-hl">WORLD</mark>');
  });

  it('wraps every occurrence', () => {
    expect(highlightHTML('a b a b', 'a')).toBe(
      '<mark class="lib-hl">a</mark> b <mark class="lib-hl">a</mark> b',
    );
  });

  it('escapes the surrounding text and highlights a plain substring', () => {
    // The query is matched AFTER escaping, so HTML-significant characters in
    // the body are still escaped while the textual hit is highlighted.
    expect(highlightHTML('a<x>b match c', 'match')).toBe(
      'a&lt;x&gt;b <mark class="lib-hl">match</mark> c',
    );
  });
});
