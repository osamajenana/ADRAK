#!/usr/bin/env node
/**
 * Enforces the performance budget in design/tokens.json against a real build.
 *
 * This is the number that decides whether a student on 2G ever sees the app at all, so it is a
 * build failure rather than a note in a README. Measured gzipped, because that is what actually
 * travels — Vite's own warning is on the raw size and will not tell you the truth about this.
 *
 * Run: npm --prefix web run build && node tools/check-bundle.mjs
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'web/dist';
const budget = JSON.parse(readFileSync('design/tokens.json', 'utf8')).performance_budget;
const LIMIT_KB = budget.student_bundle_gzip_kb;

/** Walks dist and returns every file with its gzipped size. */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);

    return statSync(path).isDirectory()
      ? walk(path)
      : [{ path, gzip: gzipSync(readFileSync(path)).length }];
  });
}

const files = walk(DIST);

/**
 * The INITIAL load only: the HTML, the CSS it links, and the entry chunk.
 *
 * Lazily-imported routes are excluded on purpose — the diagnostic runs once in a student's life
 * and practice only after they have a path, so neither is downloaded before the app has shown
 * anything. Counting them would measure a download that never happens.
 */
const initial = files.filter(
  (f) =>
    f.path.endsWith('index.html') ||
    /assets[\\/]index-[\w-]+\.(js|css)$/.test(f.path),
);

if (initial.length === 0) {
  console.error(`\n❌ no entry bundle found in ${DIST}. Did the build run?\n`);
  process.exit(1);
}

const totalKb = initial.reduce((sum, f) => sum + f.gzip, 0) / 1024;

console.log('\n  initial load (gzipped)');
for (const file of initial.sort((a, b) => b.gzip - a.gzip)) {
  console.log(`    ${(file.gzip / 1024).toFixed(1).padStart(7)} KB  ${file.path}`);
}

const lazy = files.filter((f) => /assets[\\/](?!index-)[\w-]+\.js$/.test(f.path));
if (lazy.length > 0) {
  console.log('\n  deferred (not in the first download)');
  for (const file of lazy.sort((a, b) => b.gzip - a.gzip)) {
    console.log(`    ${(file.gzip / 1024).toFixed(1).padStart(7)} KB  ${file.path}`);
  }
}

const headroom = LIMIT_KB - totalKb;
console.log(`\n  total ${totalKb.toFixed(1)} KB of ${LIMIT_KB} KB budget`);
console.log(`  headroom ${headroom.toFixed(1)} KB\n`);

if (totalKb > LIMIT_KB) {
  console.error(`❌ over budget by ${(-headroom).toFixed(1)} KB.\n`);
  process.exit(1);
}

console.log('✅ within the 2G budget.\n');
