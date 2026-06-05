/**
 * Wrap occurrences of `query` inside `text` with `<mark>` tags.
 *
 * Used by the note-card to highlight the search hit. Lives apart from React
 * because it's a pure string-to-string transformation and easier to test in
 * isolation than a JSX-returning helper.
 *
 * Empty query → identity (after HTML-escaping). Case-insensitive match; we
 * preserve the original casing of the source so the highlighted span reads
 * naturally.
 */
export function highlightHTML(text: string, query: string): string {
  const safe = escapeHTML(text);
  const q = query.trim();
  if (!q) return safe;

  const lcText = safe.toLowerCase();
  const lcQuery = q.toLowerCase();
  let out = '';
  let cursor = 0;
  while (cursor < safe.length) {
    const hit = lcText.indexOf(lcQuery, cursor);
    if (hit < 0) {
      out += safe.slice(cursor);
      break;
    }
    out += safe.slice(cursor, hit);
    out += `<mark class="lib-hl">${safe.slice(hit, hit + q.length)}</mark>`;
    cursor = hit + q.length;
  }
  return out;
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
