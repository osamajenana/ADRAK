#!/usr/bin/env node
/**
 * Verifies every semantic colour pair in design/tokens.json against WCAG 2.2 contrast minimums,
 * in BOTH themes. Runs in CI: a palette tweak that quietly breaks readability fails the build
 * rather than shipping to a student reading in sunlight on a cracked screen.
 *
 * Run: node tools/check-contrast.mjs
 */
import { readFileSync } from 'node:fs';

const tokens = JSON.parse(readFileSync('design/tokens.json', 'utf8'));

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function relativeLuminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

function contrastRatio(a, b) {
  const [l1, l2] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

let failures = 0;
const rows = [];

for (const theme of ['dark', 'light']) {
  const colors = tokens.semantic[theme];
  for (const [fg, bg, min] of tokens.contrast_pairs) {
    if (!colors[fg]) throw new Error(`${theme}: unknown token "${fg}"`);
    if (!colors[bg]) throw new Error(`${theme}: unknown token "${bg}"`);

    const ratio = contrastRatio(colors[fg], colors[bg]);
    const pass = ratio >= min;
    if (!pass) failures++;
    rows.push({ theme, pair: `${fg} on ${bg}`, ratio: ratio.toFixed(2), min: min.toFixed(1), pass });
  }
}

const width = Math.max(...rows.map((r) => r.pair.length));
let currentTheme = '';
for (const r of rows) {
  if (r.theme !== currentTheme) {
    currentTheme = r.theme;
    console.log(`\n  ${currentTheme.toUpperCase()}`);
  }
  const mark = r.pass ? '✓' : '✗';
  console.log(`  ${mark} ${r.pair.padEnd(width)}  ${r.ratio.padStart(6)} : 1   (min ${r.min})`);
}

console.log();
if (failures) {
  console.error(`❌ ${failures} contrast pair(s) below WCAG 2.2 AA.\n`);
  process.exit(1);
}
console.log(`✅ all ${rows.length} contrast pairs meet WCAG 2.2 AA in both themes.\n`);
