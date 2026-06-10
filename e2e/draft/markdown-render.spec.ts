import { expect, test } from '@playwright/test';

import { launchApp } from '../helpers/app';
import { DraftPage } from '../helpers/draft';

/**
 * Visual + behavioral check that Markdown source actually styles its content.
 *
 * The user-reported defect: `#` was correctly recognised by the parser and
 * hidden when the caret left the line, but no font-size / weight was applied
 * — heading lines rendered exactly like body text. We assert the computed
 * style on a heading line is bigger and heavier than a plain line.
 */

/**
 * @scenario H1/H2 headings get larger font-size and bold weight; the marker is hidden on inactive lines
 * @area Draft
 * @feature Markdown rendering / Headings
 * @type positive
 * @priority P0
 *
 * Preconditions:
 *   - Draft opened.
 *
 * Steps:
 *   1. Type `# Heading\nplain line with **bold** and *italic*\n## Subheading`.
 *   2. Measure computed font-size/weight on `cm-inmem-h1`, `cm-inmem-h2`, plain lines.
 *   3. Read the textContent of the inactive `cm-inmem-h1` line.
 *   4. Click back into the inactive H1 line to re-activate it.
 *
 * Expected:
 *   - H1 font-size > plain line; weight = 700.
 *   - H2 font-size > plain line, but < H1.
 *   - On inactive H1: leading `#` is removed from textContent; "Heading" stays.
 *   - After click: leading `#` re-appears so the syntax is editable.
 */
test('markdown source styles headings and inline formatting', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();
    await draft.raw.keyboard.type('# Heading');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('plain line with **bold** and *italic*');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('## Subheading');
    await draft.raw.waitForTimeout(300);

    const measurements = await draft.raw.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-line')) as HTMLElement[];
      const heading = lines.find((l) => l.classList.contains('cm-inmem-h1'));
      const sub = lines.find((l) => l.classList.contains('cm-inmem-h2'));
      const plain = lines.find(
        (l) =>
          !l.classList.contains('cm-inmem-h1') &&
          !l.classList.contains('cm-inmem-h2') &&
          !l.classList.contains('cm-inmem-h3') &&
          (l.textContent ?? '').trim().length > 0,
      );
      return {
        h1Font: heading ? parseFloat(getComputedStyle(heading).fontSize) : null,
        h1Weight: heading ? getComputedStyle(heading).fontWeight : null,
        h2Font: sub ? parseFloat(getComputedStyle(sub).fontSize) : null,
        plainFont: plain ? parseFloat(getComputedStyle(plain).fontSize) : null,
      };
    });

    // eslint-disable-next-line no-console
    console.log('[markdown-render]', JSON.stringify(measurements, null, 2));

    await draft.raw.screenshot({ path: 'test-results/draft-markdown.png' });

    expect(measurements.h1Font).not.toBeNull();
    expect(measurements.h1Font!).toBeGreaterThan(measurements.plainFont!);
    expect(measurements.h1Weight).toBe('700');
    expect(measurements.h2Font).not.toBeNull();
    expect(measurements.h2Font!).toBeGreaterThan(measurements.plainFont!);
    expect(measurements.h2Font!).toBeLessThan(measurements.h1Font!);

    const inactiveLineText = await draft.raw.evaluate(() => {
      const h1 = document.querySelector('.cm-inmem-h1') as HTMLElement | null;
      return h1?.textContent ?? null;
    });
    expect(inactiveLineText).not.toBeNull();
    expect(inactiveLineText!.trimStart().startsWith('#')).toBe(false);
    expect(inactiveLineText).toContain('Heading');

    const h1Locator = draft.raw.locator('.cm-inmem-h1');
    await h1Locator.click();
    await draft.raw.waitForTimeout(150);
    const activeLineText = await draft.raw.evaluate(() => {
      const h1 = document.querySelector('.cm-inmem-h1') as HTMLElement | null;
      return h1?.textContent ?? null;
    });
    expect(activeLineText!.trimStart().startsWith('#')).toBe(true);
  } finally {
    await handles.dispose();
  }
});

/**
 * @scenario H3 font-size sits between H2 and body text (cascade)
 * @area Draft
 * @feature Markdown rendering / Headings
 * @type edge
 * @priority P1
 *
 * Steps:
 *   1. Type `# One\n## Two\n### Three\nbody`.
 *   2. Measure font-size of each heading class and a body line.
 *
 * Expected:
 *   - H1 > H2 > H3 ≥ body font-size.
 */
test('h3 heading scales between h2 and body text', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();
    await draft.raw.keyboard.type('# One');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('## Two');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('### Three');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('body');
    await draft.raw.waitForTimeout(300);

    const m = await draft.raw.evaluate(() => {
      const px = (cls: string) => {
        const el = document.querySelector(`.cm-line.${cls}`) as HTMLElement | null;
        return el ? parseFloat(getComputedStyle(el).fontSize) : null;
      };
      const plain = Array.from(document.querySelectorAll('.cm-line')).find(
        (l) =>
          !l.classList.contains('cm-inmem-h1') &&
          !l.classList.contains('cm-inmem-h2') &&
          !l.classList.contains('cm-inmem-h3') &&
          (l.textContent ?? '').trim().length > 0,
      ) as HTMLElement | undefined;
      return {
        h1: px('cm-inmem-h1'),
        h2: px('cm-inmem-h2'),
        h3: px('cm-inmem-h3'),
        body: plain ? parseFloat(getComputedStyle(plain).fontSize) : null,
      };
    });
    expect(m.h1).not.toBeNull();
    expect(m.h2).not.toBeNull();
    expect(m.h3).not.toBeNull();
    expect(m.body).not.toBeNull();
    expect(m.h1!).toBeGreaterThan(m.h2!);
    expect(m.h2!).toBeGreaterThan(m.h3!);
    expect(m.h3!).toBeGreaterThanOrEqual(m.body!);
  } finally {
    await handles.dispose();
  }
});

/**
 * @scenario `#NotAHeading` (no trailing space) is NOT styled as a heading
 * @area Draft
 * @feature Markdown rendering / Headings
 * @type negative
 * @priority P1
 *
 * Steps:
 *   1. Type `#NotAHeading\nbody`.
 *   2. Inspect the line containing "NotAHeading".
 *
 * Expected:
 *   - The line does NOT carry the `cm-inmem-h1` class.
 *
 * Notes:
 *   - CommonMark requires whitespace after `#`; the decoration code must respect that.
 */
test('"#Foo" without a space is NOT a heading', async () => {
  const handles = await launchApp();
  try {
    const draft = await DraftPage.summon(handles.app);
    await draft.editor().click();
    await draft.raw.keyboard.type('#NotAHeading');
    await draft.raw.keyboard.press('Enter');
    await draft.raw.keyboard.type('body');
    await draft.raw.waitForTimeout(300);

    const hasHeading = await draft.raw.evaluate(() => {
      const lines = Array.from(document.querySelectorAll('.cm-line')) as HTMLElement[];
      return lines.some(
        (l) =>
          l.textContent?.includes('NotAHeading') && l.classList.contains('cm-inmem-h1'),
      );
    });
    expect(hasHeading).toBe(false);
  } finally {
    await handles.dispose();
  }
});
