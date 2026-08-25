#!/usr/bin/env node
/**
 * NABD — Skill Graph builder & validator.
 *
 * Merges content/_parts/*.json into content/skill-graph.json and, while doing so:
 *   1. normalises Arabic-Indic digits to Western digits (UI default; see design decision in the plan)
 *   2. validates codes, strands, grades and prerequisite references
 *   3. detects cycles — the graph MUST be a DAG or the recovery-path generator loops forever
 *   4. recomputes order_index by topological sort (never hand-maintained)
 *   5. computes `depth` = longest path from a root, which the Skill Map uses as its layout layer
 *
 * Run: node tools/build-skill-graph.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PARTS_DIR = 'content/_parts';
const OUT = 'content/skill-graph.json';

const GRADE_MIN = 4;
const GRADE_MAX = 9;

/* ---------------------------------------------------------------- helpers */

const ARABIC_INDIC = /[٠-٩۰-۹]/g;
const ARABIC_DECIMAL_SEP = /٫/g; // ٫
const ARABIC_THOUSANDS_SEP = /٬/g; // ٬

/** Arabic-Indic digits render inconsistently across low-end Android fonts; we store Western and
 *  transform at the display layer only (see web/src/lib/digits.ts). */
function normaliseDigits(value) {
  if (typeof value === 'string') {
    return value
      .replace(ARABIC_INDIC, (d) => String(d.codePointAt(0) & 0x0f))
      .replace(ARABIC_DECIMAL_SEP, '.')
      .replace(ARABIC_THOUSANDS_SEP, ',');
  }
  if (Array.isArray(value)) return value.map(normaliseDigits);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normaliseDigits(v)]));
  }
  return value;
}

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

/* ------------------------------------------------------------------ load */

const partFiles = readdirSync(PARTS_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const metaFile = partFiles.find((f) => f.startsWith('00-'));
if (!metaFile) throw new Error(`missing 00-meta.json in ${PARTS_DIR}`);

const meta = JSON.parse(readFileSync(join(PARTS_DIR, metaFile), 'utf8'));
const skills = [];

for (const file of partFiles.filter((f) => f !== metaFile)) {
  const part = JSON.parse(readFileSync(join(PARTS_DIR, file), 'utf8'));
  if (!Array.isArray(part)) {
    fail(`${file}: expected a JSON array of skills`);
    continue;
  }
  for (const skill of part) skills.push({ ...skill, _source: file });
}

/* -------------------------------------------------------------- validate */

const byCode = new Map();
const strandCodes = new Set(meta.strands.map((s) => s.code));
const strandOrder = new Map(meta.strands.map((s, i) => [s.code, i]));

for (const s of skills) {
  if (!s.code) fail(`${s._source}: skill without a code`);
  else if (byCode.has(s.code)) fail(`duplicate skill code "${s.code}" (${s._source})`);
  else byCode.set(s.code, s);

  if (!strandCodes.has(s.strand)) fail(`${s.code}: unknown strand "${s.strand}"`);
  if (s.grade_level < GRADE_MIN || s.grade_level > GRADE_MAX) {
    fail(`${s.code}: grade_level ${s.grade_level} outside ${GRADE_MIN}-${GRADE_MAX}`);
  }
  if (!s.name_ar?.trim()) fail(`${s.code}: missing name_ar`);
  if (!s.description_ar?.trim()) fail(`${s.code}: missing description_ar`);

  const tags = new Set();
  for (const m of s.misconceptions ?? []) {
    if (!m.tag) fail(`${s.code}: misconception without a tag`);
    else if (tags.has(m.tag)) fail(`${s.code}: duplicate misconception tag "${m.tag}"`);
    else tags.add(m.tag);
    if (!m.remediation_ar?.trim()) fail(`${s.code}/${m.tag}: missing remediation_ar`);
  }
  if (tags.size === 0) warn(`${s.code}: no misconceptions catalogued — distractors cannot be tagged`);
}

for (const s of skills) {
  for (const p of s.prerequisites ?? []) {
    if (!byCode.has(p)) fail(`${s.code}: prerequisite "${p}" does not exist`);
    else if (p === s.code) fail(`${s.code}: is its own prerequisite`);
  }
}

if (errors.length) {
  console.error('\n❌ skill graph is invalid:\n' + errors.map((e) => '   • ' + e).join('\n'));
  process.exit(1);
}

/* ---------------------------------------- topological sort (Kahn + tiebreak) */

const indegree = new Map([...byCode.keys()].map((c) => [c, 0]));
const dependents = new Map([...byCode.keys()].map((c) => [c, []]));

for (const s of skills) {
  for (const p of s.prerequisites ?? []) {
    indegree.set(s.code, indegree.get(s.code) + 1);
    dependents.get(p).push(s.code);
  }
}

/** Among the currently-unblocked skills, emit the one a curriculum would reach first. */
const rank = (code) => {
  const s = byCode.get(code);
  return [s.grade_level, strandOrder.get(s.strand), s.code];
};
const cmp = (a, b) => {
  const [ag, as_, ac] = rank(a);
  const [bg, bs, bc] = rank(b);
  return ag - bg || as_ - bs || ac.localeCompare(bc);
};

const ready = [...indegree.entries()].filter(([, d]) => d === 0).map(([c]) => c);
const sorted = [];

while (ready.length) {
  ready.sort(cmp);
  const code = ready.shift();
  sorted.push(code);
  for (const next of dependents.get(code)) {
    indegree.set(next, indegree.get(next) - 1);
    if (indegree.get(next) === 0) ready.push(next);
  }
}

if (sorted.length !== skills.length) {
  const stuck = [...indegree.entries()].filter(([, d]) => d > 0).map(([c]) => c);
  console.error(`\n❌ cycle detected in the skill graph. Involved: ${stuck.join(', ')}`);
  process.exit(1);
}

/* --------------------------------------------- depth = Skill Map layout layer */

const depth = new Map();
for (const code of sorted) {
  const prereqs = byCode.get(code).prerequisites ?? [];
  depth.set(code, prereqs.length ? Math.max(...prereqs.map((p) => depth.get(p))) + 1 : 0);
}

/* ----------------------------------------------------------------- emit */

const ordered = sorted.map((code, i) => {
  const { _source, ...skill } = byCode.get(code);
  return normaliseDigits({
    ...skill,
    order_index: i + 1,
    depth: depth.get(code),
    prerequisites: skill.prerequisites ?? [],
    misconceptions: skill.misconceptions ?? [],
  });
});

const out = {
  ...normaliseDigits(meta),
  built_at: null, // stamped by the seeder, kept null so the file is byte-stable across rebuilds
  stats: {
    skills: ordered.length,
    spine_skills: ordered.filter((s) => s.is_spine).length,
    max_depth: Math.max(...depth.values()),
    misconceptions: ordered.reduce((n, s) => n + s.misconceptions.length, 0),
    by_grade: Object.fromEntries(
      [...Array(GRADE_MAX - GRADE_MIN + 1)].map((_, i) => [
        GRADE_MIN + i,
        ordered.filter((s) => s.grade_level === GRADE_MIN + i).length,
      ]),
    ),
  },
  skills: ordered,
};

writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n', 'utf8');

/* ---------------------------------------------------------------- report */

console.log(`\n✅ ${OUT}`);
console.log(`   skills          ${out.stats.skills}  (spine: ${out.stats.spine_skills})`);
console.log(`   max depth       ${out.stats.max_depth}  → Skill Map layout layers`);
console.log(`   misconceptions  ${out.stats.misconceptions}`);
console.log(`   by grade        ${JSON.stringify(out.stats.by_grade)}`);
if (warnings.length) console.log('\n⚠️  ' + warnings.join('\n⚠️  '));
console.log();
