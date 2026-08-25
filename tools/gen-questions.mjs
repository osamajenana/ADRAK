#!/usr/bin/env node
/**
 * Builds the question bank into content/questions/<SKILL_CODE>.json.
 *
 * Deterministic: seeded per (skill, difficulty, index), so the same command always produces the
 * same bank. That matters more than it sounds — the demo, the field pilot and the seeded database
 * all have to show the same questions, and regenerating must not silently reshuffle a student's
 * history.
 *
 * Every option's misconception_tag is validated against that skill's catalogue in
 * content/skill-graph.json. A tag that does not exist there is a hard error: an untagged or
 * mistagged distractor quietly corrupts the teacher dashboard's misconception analytics, which is
 * the one thing on that screen a teacher would act on.
 *
 * Run: node tools/gen-questions.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { rng } from './questions/lib.mjs';
import { generators } from './questions/generators.mjs';

const OUT_DIR = 'content/questions';
const SPINE_PER_DIFFICULTY = 10; // 30 per spine skill
const OTHER_PER_DIFFICULTY = 4; //  12 per supporting skill
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const MAX_ATTEMPTS_FACTOR = 40;

const graph = JSON.parse(readFileSync('content/skill-graph.json', 'utf8'));
const skills = new Map(graph.skills.map((s) => [s.code, s]));

const errors = [];

/* --------------------------------------------------------------- validation */

function validate(question, skill) {
  const where = `${skill.code}/${question.difficulty}`;
  const catalogue = new Set(skill.misconceptions.map((m) => m.tag));

  const correct = question.options.filter((o) => o.is_correct);
  if (correct.length !== 1) errors.push(`${where}: ${correct.length} correct options, expected 1`);

  if (question.type === 'mcq' && question.options.length !== 4) {
    errors.push(`${where}: ${question.options.length} options, expected 4`);
  }

  const texts = question.options.map((o) => o.text_ar);
  if (new Set(texts).size !== texts.length) {
    errors.push(`${where}: duplicate option text in [${texts.join(', ')}]`);
  }

  for (const option of question.options) {
    if (option.misconception_tag && !catalogue.has(option.misconception_tag)) {
      errors.push(`${where}: tag "${option.misconception_tag}" is not in this skill's catalogue`);
    }
    if (option.is_correct && option.misconception_tag) {
      errors.push(`${where}: the correct option carries a misconception tag`);
    }
  }
}

/* ------------------------------------------------------------------ build */

mkdirSync(OUT_DIR, { recursive: true });
for (const stale of readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'))) {
  unlinkSync(`${OUT_DIR}/${stale}`);
}

/** Stable per (skill, difficulty, index) so regeneration is a no-op, not a reshuffle. */
const seedFor = (code, difficulty, i) => {
  const key = `${code}|${difficulty}|${i}`;
  let h = 2166136261;
  for (let c = 0; c < key.length; c++) {
    h = Math.imul(h ^ key.charCodeAt(c), 16777619);
  }
  return h >>> 0;
};

let totalQuestions = 0;
let taggedDistractors = 0;
let untaggedDistractors = 0;
const rows = [];

for (const [code, generate] of Object.entries(generators)) {
  const skill = skills.get(code);
  if (!skill) {
    errors.push(`generator for "${code}" has no matching skill in the graph`);
    continue;
  }

  const target = skill.is_spine ? SPINE_PER_DIFFICULTY : OTHER_PER_DIFFICULTY;
  const questions = [];

  for (const difficulty of DIFFICULTIES) {
    const seen = new Set();
    let produced = 0;
    for (let attempt = 0; produced < target && attempt < target * MAX_ATTEMPTS_FACTOR; attempt++) {
      const question = generate(rng(seedFor(code, difficulty, attempt)), difficulty);
      // Two draws can land on the same numbers; keep the bank free of literal duplicates.
      const fingerprint = `${question.stem_ar}|${question.expression ?? ''}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      validate(question, skill);
      questions.push(question);
      produced++;
    }
    if (produced < target) {
      errors.push(`${code}/${difficulty}: only ${produced}/${target} distinct items could be drawn`);
    }
  }

  for (const q of questions) {
    for (const o of q.options) {
      if (o.is_correct) continue;
      if (o.misconception_tag) taggedDistractors++;
      else untaggedDistractors++;
    }
  }

  writeFileSync(
    `${OUT_DIR}/${code}.json`,
    JSON.stringify({ skill_code: code, count: questions.length, questions }, null, 2) + '\n',
    'utf8',
  );

  totalQuestions += questions.length;
  rows.push({ code, count: questions.length, spine: skill.is_spine });
}

/* ----------------------------------------------------------------- report */

if (errors.length) {
  console.error('\n❌ question bank is invalid:\n' + errors.map((e) => '   • ' + e).join('\n') + '\n');
  process.exit(1);
}

const covered = new Set(Object.keys(generators));
const spineGaps = graph.skills.filter((s) => s.is_spine && !covered.has(s.code)).map((s) => s.code);
const otherGaps = graph.skills.filter((s) => !s.is_spine && !covered.has(s.code)).map((s) => s.code);
const tagRate = (100 * taggedDistractors) / (taggedDistractors + untaggedDistractors);

console.log(`\n✅ ${OUT_DIR}/`);
for (const r of rows) {
  console.log(`   ${r.spine ? '▎' : ' '} ${r.code.padEnd(16)} ${String(r.count).padStart(3)}`);
}
console.log(`\n   questions              ${totalQuestions}`);
console.log(`   tagged distractors     ${taggedDistractors} of ${taggedDistractors + untaggedDistractors}  (${tagRate.toFixed(1)}%)`);
console.log(`   skills with a bank     ${covered.size} of ${graph.skills.length}`);
console.log(`\n   ⏳ spine skills still without a generator (${spineGaps.length}):`);
console.log(`      ${spineGaps.join(', ') || '—'}`);
console.log(`   ⏳ supporting skills still without a generator: ${otherGaps.length}\n`);
