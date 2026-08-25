#!/usr/bin/env node
/**
 * Generates engine-spec/vectors/*.json from the reference implementation.
 *
 * The vectors are the contract between web/src/engine (TypeScript, runs offline on the student's
 * device) and api/app/Engine (PHP, the authority). Both suites replay these files.
 *
 * Regenerate only when SPEC.md changes — never to make a failing test pass.
 *
 * Run: node tools/gen-engine-vectors.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as E from '../engine-spec/reference/index.mjs';

const OUT_DIR = 'engine-spec/vectors';
mkdirSync(OUT_DIR, { recursive: true });

const graph = JSON.parse(readFileSync('engine-spec/fixtures/mini-graph.json', 'utf8')).skills;
const gradeOf = Object.fromEntries(graph.map((s) => [s.code, s.grade_level]));

const write = (name, payload) => {
  writeFileSync(`${OUT_DIR}/${name}.json`, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`   ${name.padEnd(16)} ${payload.cases.length} cases`);
};

const a = (correct, difficulty) => ({ correct, difficulty });
const rep = (n, correct, difficulty) => Array.from({ length: n }, () => a(correct, difficulty));

/* --------------------------------------------------------------- mastery */

const masteryCases = [
  { name: 'no attempts yet', attempts: [] },
  {
    name: 'mastered: 8 correct including 2 hard',
    attempts: [...rep(3, true, 'easy'), ...rep(3, true, 'medium'), ...rep(2, true, 'hard')],
  },
  {
    name: 'not mastered: perfect but never tested at hard',
    attempts: rep(10, true, 'easy'),
  },
  {
    name: 'not mastered: only 7 attempts',
    attempts: [...rep(3, true, 'easy'), ...rep(2, true, 'medium'), ...rep(2, true, 'hard')],
  },
  {
    name: 'not mastered: one hard correct only',
    attempts: [...rep(4, true, 'easy'), ...rep(3, true, 'medium'), a(true, 'hard')],
  },
  {
    name: 'recency: struggled early, solid recently',
    attempts: [...rep(4, false, 'medium'), ...rep(3, true, 'medium'), ...rep(3, true, 'hard')],
  },
  {
    name: 'recency mirror: solid early, collapsed recently',
    attempts: [...rep(3, true, 'hard'), ...rep(3, true, 'medium'), ...rep(4, false, 'medium')],
  },
  {
    name: 'borderline: mixed at hard',
    attempts: [
      ...rep(2, true, 'easy'),
      a(false, 'medium'),
      ...rep(3, true, 'medium'),
      a(false, 'hard'),
      ...rep(2, true, 'hard'),
    ],
  },
  { name: 'single wrong attempt', attempts: [a(false, 'medium')] },
  { name: 'single correct attempt', attempts: [a(true, 'hard')] },
  {
    // Same attempts as 'struggled early, solid recently', which scores 75.36 and stays `learning`
    // at the default 85. A skill configured at 70 must let that exact record through — this is
    // the only case that actually exercises the threshold parameter.
    name: 'threshold 70 masters the record that 85 holds back',
    attempts: [...rep(4, false, 'medium'), ...rep(3, true, 'medium'), ...rep(3, true, 'hard')],
    threshold: 70,
  },
];

write('mastery', {
  function: 'masteryScore',
  spec: 'SPEC.md#1',
  cases: masteryCases.map((c) => ({
    name: c.name,
    input: { attempts: c.attempts, threshold: c.threshold ?? E.DEFAULT_MASTERY_THRESHOLD },
    expected: E.masteryScore(c.attempts, c.threshold ?? E.DEFAULT_MASTERY_THRESHOLD),
  })),
});

/* ------------------------------------------------------------ difficulty */

const difficultyInputs = [
  ['fresh start at easy', 'easy', 0, 0],
  ['one correct is not enough to promote', 'easy', 1, 0],
  ['promote easy to medium', 'easy', 2, 0],
  ['promote medium to hard', 'medium', 2, 0],
  ['already at hard, keep the streak', 'hard', 2, 0],
  ['already at hard, long streak', 'hard', 5, 0],
  ['one wrong is not enough to demote', 'medium', 0, 1],
  ['demote hard to medium', 'hard', 0, 2],
  ['demote medium to easy', 'medium', 0, 2],
  ['at easy with two wrong: hold and keep counting', 'easy', 0, 2],
  ['at easy with three wrong: the gap is below this skill', 'easy', 0, 3],
  ['at easy with four wrong still routes', 'easy', 0, 4],
  ['hard with three wrong demotes before it can ever route', 'hard', 0, 3],
  ['wrong outranks correct when both thresholds are met', 'medium', 2, 2],
];

write('difficulty', {
  function: 'nextDifficulty',
  spec: 'SPEC.md#2',
  cases: difficultyInputs.map(([name, difficulty, right, wrong]) => {
    const input = { difficulty, consecutive_correct: right, consecutive_wrong: wrong };
    return { name, input, expected: E.nextDifficulty(input) };
  }),
});

/* ------------------------------------------------------------ diagnostic */

/** Replays a full adaptive walk, recording every decision so both suites can step through it. */
function walk(name, grade, answerProbe) {
  const candidates = graph
    .filter((s) => s.grade_level <= grade)
    .sort((x, y) => x.order_index - y.order_index)
    .map((s) => s.code);

  let state = {
    grade,
    candidates,
    probes: [],
    lo: -1,
    hi: candidates.length,
    asked: 0,
    max_questions: E.MAX_DIAGNOSTIC_QUESTIONS,
    probe_size: E.PROBE_SIZE,
  };

  const steps = [];
  for (;;) {
    const decision = E.diagnosticNext(state);
    steps.push({
      before: { lo: state.lo, hi: state.hi, asked: state.asked },
      decision,
    });
    if (decision.action === 'finish') break;

    const correct = answerProbe(decision.skill_code);
    const probe = { skill_code: decision.skill_code, correct, total: E.PROBE_SIZE };
    steps[steps.length - 1].probe = probe;
    state = E.diagnosticApply(state, probe);
  }

  return {
    name,
    input: { grade, candidates, max_questions: E.MAX_DIAGNOSTIC_QUESTIONS, probe_size: E.PROBE_SIZE },
    steps,
    expected_result: E.diagnosticResult(state, gradeOf),
  };
}

const trueLevelAt = (masteredThrough) => (code) => {
  const idx = graph.findIndex((s) => s.code === code);
  return idx <= masteredThrough ? 3 : 0;
};

write('diagnostic', {
  function: 'diagnosticNext + diagnosticApply + diagnosticResult',
  spec: 'SPEC.md#3',
  cases: [
    // The headline claim: a grade-7 student located at grade 5 in nine questions.
    walk('grade 7 student whose real frontier is S3', 7, trueLevelAt(2)),
    walk('grade 7 student who masters everything probed', 7, () => 3),
    walk('grade 7 student who fails the very first probe chain', 7, () => 0),
    walk('grade 9 student with a mid-range frontier', 9, trueLevelAt(5)),
    walk('grade 4 student with only two candidates', 4, trueLevelAt(0)),
    // Partial credit lands in the `weak` bucket rather than mastered or missing.
    walk('partial knowledge scores 1 of 3 on every probe', 7, () => 1),
  ],
});

/* --------------------------------------------------------- recovery path */

const allNotStarted = {};
const masteredThroughS3 = { S1: 'mastered', S2: 'mastered', S3: 'mastered' };

const recoveryCases = [
  { name: 'nothing mastered yet, target deep in the graph', statuses: allNotStarted, target: 'S9' },
  { name: 'first three mastered, target S9', statuses: masteredThroughS3, target: 'S9' },
  { name: 'target is the immediate next skill', statuses: masteredThroughS3, target: 'S4' },
  { name: 'target already mastered yields an empty path', statuses: masteredThroughS3, target: 'S2' },
  {
    name: 'diamond: S9 needs both branches',
    statuses: { S1: 'mastered', S2: 'mastered', S3: 'mastered', S4: 'mastered', S5: 'mastered', S6: 'mastered', S7: 'mastered' },
    target: 'S9',
  },
  { name: 'learning counts as pending, not mastered', statuses: { S1: 'mastered', S2: 'learning' }, target: 'S4' },
  { name: 'unknown target yields an empty path', statuses: allNotStarted, target: 'NOPE' },
  { name: 'root skill with no prerequisites', statuses: allNotStarted, target: 'S1' },
];

write('recovery-path', {
  function: 'recoveryPath',
  spec: 'SPEC.md#4',
  cases: recoveryCases.map((c) => ({
    name: c.name,
    input: { statuses: c.statuses, target: c.target },
    expected: E.recoveryPath(graph, c.statuses, c.target),
  })),
});

/* ------------------------------------------------------------------- elo */

const eloInputs = [
  ['evenly matched, student correct', 1200, 1200, true],
  ['evenly matched, student wrong', 1200, 1200, false],
  ['strong student clears an easy item', 1600, 1000, true],
  ['strong student trips on an easy item', 1600, 1000, false],
  ['weak student clears a hard item', 900, 1500, true],
  ['weak student misses a hard item', 900, 1500, false],
  ['fractional ratings survive the round trip', 1234.56, 1187.43, true],
  ['extreme gap barely moves the winner', 2000, 800, true],
];

write('elo', {
  function: 'eloUpdate',
  spec: 'SPEC.md#5',
  cases: eloInputs.map(([name, theta, itemElo, correct]) => ({
    name,
    input: { theta, item_elo: itemElo, correct },
    expected: E.eloUpdate(theta, itemElo, correct),
  })),
});

/* ---------------------------------------------------------------- review */

const MASTERED_AT = 1767225600; // 2026-01-01T00:00:00Z — fixed so vectors never depend on a clock

write('review', {
  function: 'nextReviewAt',
  spec: 'SPEC.md#6',
  cases: [0, 1, 2, 3, 10].map((reviewCount) => ({
    name: `review ${reviewCount}`,
    input: { mastered_at: MASTERED_AT, review_count: reviewCount },
    expected: E.nextReviewAt(MASTERED_AT, reviewCount),
  })),
});

console.log('\n✅ vectors regenerated from engine-spec/reference/index.mjs\n');
