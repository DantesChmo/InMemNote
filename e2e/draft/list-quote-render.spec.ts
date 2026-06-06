import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Inactive list lines must show a pretty bullet (or original numeric prefix)
 * instead of the raw `-`/`*` source. Blockquotes must get the accent left
 * border + italic styling. Active lines still expose the raw syntax so the
 * user can edit it.
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
    // box-shadow with `inset 2px 0 0 <accent>` always reports a numeric
    // pixel value rather than `none`.
    expect(measurements.quoteBoxShadow).not.toBe('none');
  } finally {
    await handles.dispose();
  }
});
