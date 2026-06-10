#!/usr/bin/env node
/**
 * Generate `e2e/TEST-PLAN.md` from the structured JSDoc on every `test(...)`
 * in `e2e/**`. Run via `npm run gen:test-plan`.
 *
 * The generator is dependency-free on purpose: it ships with the repo and
 * must run in the `quality` CI job before any `npm ci`-installed dev deps
 * (it only needs the Node 22 standard library).
 *
 * Recognized JSDoc tags (one per line):
 *   @scenario   one-line headline shown as the section title
 *   @area       Draft | Library | Cross-window | Visual
 *   @feature    free-form feature name; groups scenarios within an area
 *   @type       positive | negative | edge | race | persistence
 *   @priority   P0 | P1 | P2
 *
 * Recognized JSDoc sections (label followed by an indented list):
 *   Preconditions:
 *   Steps:
 *   Expected:
 *   Notes:
 *
 * A docstring is paired with the FIRST `test(` that follows it (whitespace
 * and `for (...)` blocks in between are fine — pin-drag.spec.ts uses that).
 *
 * If a docstring is missing required tags (`@scenario`, `@area`, `@feature`,
 * `@priority`), the generator prints a warning and exits with code 1 so CI
 * catches the omission.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');
const E2E_DIR = join(REPO_ROOT, 'e2e');
const OUTPUT_FILE = join(E2E_DIR, 'TEST-PLAN.md');

const PRIORITY_ORDER = ['P0', 'P1', 'P2'];
const TYPE_ORDER = ['positive', 'negative', 'edge', 'race', 'persistence'];
const AREA_ORDER = ['Draft', 'Library', 'Cross-window', 'Visual'];

async function main() {
  const files = await collectSpecFiles(E2E_DIR);
  const scenarios = [];
  const errors = [];

  for (const file of files) {
    const text = await readFile(file, 'utf8');
    const found = extractScenarios(text);
    for (const sc of found) {
      sc.file = relative(REPO_ROOT, file);
      if (sc.__orphan) {
        errors.push(
          `${sc.file} — test "${sc.testName}" has no immediately-preceding @scenario JSDoc block`,
        );
        continue;
      }
      const missing = validateScenario(sc);
      if (missing.length > 0) {
        errors.push(
          `${sc.file} — test "${sc.testName ?? '?'}" is missing: ${missing.join(', ')}`,
        );
        continue;
      }
      scenarios.push(sc);
    }
  }

  if (errors.length > 0) {
    console.error('Test plan generation failed:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const md = renderMarkdown(scenarios);
  await writeFile(OUTPUT_FILE, md, 'utf8');
  console.log(
    `Wrote ${relative(REPO_ROOT, OUTPUT_FILE)} — ${scenarios.length} scenarios across ${files.length} files.`,
  );
}

/**
 * Walk a directory and return every `*.spec.ts` (or `.spec.tsx`) path.
 */
async function collectSpecFiles(root) {
  const out = [];
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile() && /\.spec\.tsx?$/.test(e.name)) {
        out.push(full);
      }
    }
  }
  await walk(root);
  out.sort();
  return out;
}

/**
 * Parse a TypeScript source file. For every `test('name', …)` call we
 * require an immediately-preceding JSDoc block with a `@scenario` tag —
 * undocumented tests would slip through the regression plan silently
 * otherwise. Returns scenarios; orphan tests are reported with `__orphan`
 * markers so `main()` can fail CI.
 *
 * We do a single linear scan over the source, recognising two token kinds:
 *   - JSDoc blocks (with `@scenario`): cached as "pending" docs.
 *   - `test('name', …)` calls: consume the pending doc, or flag an orphan.
 *
 * `test.describe(...)` is intentionally skipped — that pattern doesn't
 * match `\btest\s*\(` (there's a `.` after `test`).
 */
function extractScenarios(source) {
  const results = [];
  const tokenRe = /\/\*\*([\s\S]*?)\*\/|\btest\s*\(\s*([`'"])((?:\\\2|(?!\2).)*)\2/g;
  let m;
  let pending = null;
  while ((m = tokenRe.exec(source)) !== null) {
    if (m[1] !== undefined) {
      // JSDoc block. Only track it if it actually carries a scenario.
      if (m[1].includes('@scenario')) {
        pending = parseBlock(m[1]);
      } else {
        // Non-scenario JSDoc between docstring and test() is a layout error
        // — we want the doc immediately above test(). Drop any pending.
        pending = null;
      }
    } else {
      const testName = m[3];
      if (pending) {
        pending.testName = testName;
        results.push(pending);
        pending = null;
      } else {
        results.push({ __orphan: true, testName });
      }
    }
  }
  return results;
}

/**
 * Parse a single JSDoc block body (already stripped of the `/**` and `*​/`).
 * Returns `{tags, sections}` where sections is { Preconditions, Steps, … }.
 */
function parseBlock(block) {
  // Strip the leading `* ` from each line.
  const lines = block.split('\n').map((l) => l.replace(/^\s*\*\s?/, '').replace(/\s+$/, ''));
  const tags = {};
  const sections = {};
  let currentSection = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tagMatch = /^@(\w+)\s+(.*)$/.exec(line);
    if (tagMatch) {
      tags[tagMatch[1]] = tagMatch[2].trim();
      currentSection = null;
      continue;
    }
    const sectionMatch = /^(Preconditions|Steps|Expected|Notes):\s*$/.exec(line);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      sections[currentSection] = [];
      continue;
    }
    if (currentSection) {
      // Collect bullet/numbered items by trimming the marker; preserve the
      // original numbering by storing the raw text minus the leading marker.
      const item = line.replace(/^\s*(?:[-*]|\d+\.)\s+/, '').trim();
      if (item.length === 0) {
        // Blank line inside a section ends that section.
        currentSection = null;
      } else {
        sections[currentSection].push(item);
      }
    }
  }

  return {
    scenario: tags.scenario,
    area: tags.area,
    feature: tags.feature,
    type: tags.type,
    priority: tags.priority,
    preconditions: sections.Preconditions ?? [],
    steps: sections.Steps ?? [],
    expected: sections.Expected ?? [],
    notes: sections.Notes ?? [],
  };
}

function validateScenario(sc) {
  const missing = [];
  for (const key of ['scenario', 'area', 'feature', 'priority']) {
    if (!sc[key]) missing.push(`@${key}`);
  }
  if (sc.priority && !PRIORITY_ORDER.includes(sc.priority)) {
    missing.push(`@priority must be one of ${PRIORITY_ORDER.join('/')} (got ${sc.priority})`);
  }
  if (sc.type && !TYPE_ORDER.includes(sc.type)) {
    missing.push(`@type must be one of ${TYPE_ORDER.join('/')} (got ${sc.type})`);
  }
  if (sc.steps.length === 0) missing.push('Steps');
  if (sc.expected.length === 0) missing.push('Expected');
  return missing;
}

// ---------- Rendering ----------

function renderMarkdown(scenarios) {
  const byArea = groupBy(scenarios, (s) => s.area);
  const totals = countTotals(scenarios);

  const out = [];
  out.push('# Inmemnote — E2E regression test plan');
  out.push('');
  out.push('> Auto-generated from JSDoc in `e2e/**/*.spec.ts`.');
  out.push('> Do NOT edit by hand — run `npm run gen:test-plan` to refresh.');
  out.push(`> CI fails if this file is out of sync with the source specs.`);
  out.push('');
  out.push('## Summary');
  out.push('');
  out.push(`- Total scenarios: **${scenarios.length}**`);
  out.push(
    `- By priority: ${PRIORITY_ORDER.map((p) => `**${p}** = ${totals.priority[p] ?? 0}`).join(', ')}`,
  );
  out.push(
    `- By type: ${TYPE_ORDER.map((t) => `**${t}** = ${totals.type[t] ?? 0}`).join(', ')}`,
  );
  out.push(`- By area: ${[...byArea.keys()].map((a) => `**${a}** = ${byArea.get(a).length}`).join(', ')}`);
  out.push('');
  out.push('## Table of contents');
  out.push('');
  for (const area of sortedAreas([...byArea.keys()])) {
    out.push(`- [${area}](#${slug(area)})`);
    const byFeature = groupBy(byArea.get(area), (s) => s.feature);
    for (const feat of [...byFeature.keys()].sort()) {
      out.push(`  - [${feat}](#${slug(`${area}-${feat}`)}) (${byFeature.get(feat).length})`);
    }
  }
  out.push('');

  for (const area of sortedAreas([...byArea.keys()])) {
    out.push(`## ${area}`);
    out.push('');
    const byFeature = groupBy(byArea.get(area), (s) => s.feature);
    for (const feat of [...byFeature.keys()].sort()) {
      out.push(`### ${feat} <a id="${slug(`${area}-${feat}`)}"></a>`);
      out.push('');
      const scs = byFeature
        .get(feat)
        .slice()
        .sort((a, b) => prioRank(a.priority) - prioRank(b.priority));
      for (const sc of scs) {
        renderScenario(out, sc);
      }
    }
  }

  return out.join('\n') + '\n';
}

function renderScenario(out, sc) {
  out.push(`#### [${sc.priority}] ${sc.scenario}`);
  out.push('');
  out.push(`- **File**: \`${sc.file}\``);
  out.push(`- **Test**: \`${sc.testName}\``);
  out.push(`- **Type**: ${sc.type ?? '—'}`);
  out.push('');
  if (sc.preconditions.length > 0) {
    out.push('**Preconditions:**');
    for (const p of sc.preconditions) out.push(`- ${p}`);
    out.push('');
  }
  if (sc.steps.length > 0) {
    out.push('**Steps:**');
    sc.steps.forEach((s, i) => out.push(`${i + 1}. ${s}`));
    out.push('');
  }
  if (sc.expected.length > 0) {
    out.push('**Expected:**');
    for (const e of sc.expected) out.push(`- ${e}`);
    out.push('');
  }
  if (sc.notes.length > 0) {
    out.push('**Notes:**');
    for (const n of sc.notes) out.push(`- ${n}`);
    out.push('');
  }
  out.push('---');
  out.push('');
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
}

function countTotals(scenarios) {
  const priority = {};
  const type = {};
  for (const s of scenarios) {
    priority[s.priority] = (priority[s.priority] ?? 0) + 1;
    if (s.type) type[s.type] = (type[s.type] ?? 0) + 1;
  }
  return { priority, type };
}

function sortedAreas(areas) {
  return areas.slice().sort((a, b) => {
    const ia = AREA_ORDER.indexOf(a);
    const ib = AREA_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

function prioRank(p) {
  const i = PRIORITY_ORDER.indexOf(p);
  return i === -1 ? 999 : i;
}

function slug(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
