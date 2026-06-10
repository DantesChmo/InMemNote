import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Inactive list lines must show a pretty bullet (or original numeric prefix)
 * instead of the raw `-`/`*` source. Blockquotes must get the accent left
 * border + italic styling. Active lines still expose the raw syntax so the
 * user can edit it.
 */

/**
 * @scenario Bullet/numbered list lines get widget decorations; blockquote gets accent stripe and italic
 * @area Draft
 * @feature Markdown rendering / Lists & Quotes
 * @type positive
 * @priority P0
 *
 * Steps:
 *   1. Type a `- bullet one` line, then `1. numbered one`, then `> quoted line`,
 *      then a plain trailing line. Wipe each line before typing to defeat
 *      CodeMirror's list auto-continue.
 *   2. Read computed styles and widget elements on each line.
 *
 * Expected:
 *   - Bullet line: contains a `.cm-inmem-bullet` widget; textContent starts with "•",
 *     not "-".
 *   - Numbered line: contains a `.cm-inmem-ol` widget; textContent contains "1.".
 *   - Quote line: has class `cm-inmem-quote`; computed `font-style` is italic;
 *     `box-shadow` is non-`none` (accent stripe).
 */
test('lists render with bullet widgets and quotes get the accent stripe', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();

    // After Enter, CodeMirror's default keymap may auto-continue the previous
    // block (bullets, ordered lists, blockquotes). For deterministic input we
    // wipe the current line before each typing step.
    const typeFresh = async (text: string, enterAfter = true): Promise<void> => {
      await draft.raw.keyboard.press('Home');
      await draft.raw.keyboard.press('Shift+End');
      await draft.raw.keyboard.press('Delete');
      await draft.raw.keyboard.type(text);
      if (enterAfter) await draft.raw.keyboard.press('Enter');
    };

    await typeFresh('- bullet one');
    await typeFresh('1. numbered one');
    await typeFresh('> quoted line');
    await typeFresh('plain trailing caret line', false);
    await draft.raw.waitForTimeout(300);

    const measurements = await draft.raw.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-line')) as HTMLElement[];
      const findByText = (needle: string) =>
        lines.find((l) => l.textContent?.includes(needle)) ?? null;
      const bulletLine = findByText('bullet one');
      const numberedLine = findByText('numbered one');
      const quoteLine = findByText('quoted line');

      const quoteStyle = quoteLine ? getComputedStyle(quoteLine) : null;
      return {
        bulletHasWidget: !!bulletLine?.querySelector('.cm-inmem-bullet'),
        bulletText: bulletLine?.textContent ?? '',
        numberedHasWidget: !!numberedLine?.querySelector('.cm-inmem-ol'),
        numberedText: numberedLine?.textContent ?? '',
        quoteHasClass: !!quoteLine?.classList.contains('cm-inmem-quote'),
        quoteFontStyle: quoteStyle?.fontStyle ?? null,
        quoteBoxShadow: quoteStyle?.boxShadow ?? null,
      };
    });

    // eslint-disable-next-line no-console
    console.log('[list-quote-render]', JSON.stringify(measurements, null, 2));

    await draft.raw.screenshot({ path: 'test-results/draft-lists-quote.png' });

    expect(measurements.bulletHasWidget).toBe(true);
    expect(measurements.bulletText.startsWith('-')).toBe(false);
    expect(measurements.bulletText).toContain('•');

    expect(measurements.numberedHasWidget).toBe(true);
    expect(measurements.numberedText).toContain('1.');

    expect(measurements.quoteHasClass).toBe(true);
    expect(measurements.quoteFontStyle).toBe('italic');
    expect(measurements.quoteBoxShadow).not.toBe('none');
  } finally {
    await handles.dispose();
  }
});

/**
 * @scenario Asterisk-style bullets (`*`) render the same widget as dash-style (`-`)
 * @area Draft
 * @feature Markdown rendering / Lists
 * @type edge
 * @priority P2
 *
 * Steps:
 *   1. Type `* star bullet`, Enter, then a character so the previous line is inactive.
 *   2. Inspect the inactive line.
 *
 * Expected:
 *   - The line carries the `.cm-inmem-bullet` widget.
 *   - textContent contains "•" and does NOT start with "*".
 */
test('asterisk bullets render with the same bullet widget as dash bullets', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();
    await draft.raw.keyboard.type('* star bullet');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('z');
    await draft.raw.waitForTimeout(300);

    const r = await draft.raw.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-line')) as HTMLElement[];
      const line = lines.find((l) => l.textContent?.includes('star bullet'));
      return {
        hasWidget: !!line?.querySelector('.cm-inmem-bullet'),
        text: line?.textContent ?? '',
      };
    });
    expect(r.hasWidget).toBe(true);
    expect(r.text).toContain('•');
    expect(r.text.startsWith('*')).toBe(false);
  } finally {
    await handles.dispose();
  }
});

/**
 * @scenario A leading hyphen without trailing space is NOT a bullet
 * @area Draft
 * @feature Markdown rendering / Lists
 * @type negative
 * @priority P1
 *
 * Steps:
 *   1. Type `-12 cm of rain`, Enter, then "next".
 *   2. Inspect the line containing "12 cm".
 *
 * Expected:
 *   - The line has 0 `.cm-inmem-bullet` widgets.
 *
 * Notes:
 *   - Decoration must require the trailing whitespace; otherwise text like
 *     "-12" would be mistaken for a list marker.
 */
test('a leading hyphen without a trailing space does not become a bullet', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();
    await draft.raw.keyboard.type('-12 cm of rain');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('next');
    await draft.raw.waitForTimeout(300);

    const widgetCount = await draft.raw.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-line')) as HTMLElement[];
      const line = lines.find((l) => l.textContent?.includes('12 cm'));
      return line ? line.querySelectorAll('.cm-inmem-bullet').length : -1;
    });
    expect(widgetCount).toBe(0);
  } finally {
    await handles.dispose();
  }
});
