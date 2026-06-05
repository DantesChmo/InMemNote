/**
 * Build a single-line preview for a library card.
 *
 * Skips the title line, strips common markdown markers, then joins the rest
 * with double spaces so the preview reads as one flow. Kept tiny — the card
 * shows 2 clamped lines anyway, anything more elaborate would be wasted work.
 */
export function previewOf(body: string): string {
  const lines = body.split('\n');
  if (lines.length <= 1) return '';
  return lines
    .slice(1)
    .map(stripMarkers)
    .filter((s) => s.trim().length > 0)
    .join('  ');
}

function stripMarkers(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+/, '• ')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/_(.+?)_/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}
