/**
 * ADRAK Adaptive Engine — reference implementation.
 *
 * This file is normative: it is the executable form of SPEC.md and the source the test vectors
 * are generated from. It is deliberately dependency-free, side-effect-free and clock-free so the
 * TypeScript client and the PHP server can both be checked against it.
 *
 * Do not import this from application code. `web/` and `api/` each carry their own idiomatic
 * implementation; this one exists so those two can be proven equal.
 */

/* ------------------------------------------------------------------ shared */

/** Specified explicitly: PHP's round() and JS's Math.round() disagree on negative halves. */
export const round2 = (x) => Math.floor(x * 100 + 0.5) / 100;

const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIFFICULTY_WEIGHT = { easy: 1.0, medium: 1.5, hard: 2.0 };
const RECENCY_DECAY = 0.9;

const promote = (d) => DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(d) + 1, DIFFICULTIES.length - 1)];
const demote = (d) => DIFFICULTIES[Math.max(DIFFICULTIES.indexOf(d) - 1, 0)];

/* ---------------------------------------------------------------- mastery */

export const DEFAULT_MASTERY_THRESHOLD = 85;
export const MIN_ATTEMPTS_FOR_MASTERY = 8;
export const MIN_HARD_CORRECT_FOR_MASTERY = 2;

/**
 * @param {{correct: boolean, difficulty: 'easy'|'medium'|'hard'}[]} attempts oldest first
 */
export function masteryScore(attempts, threshold = DEFAULT_MASTERY_THRESHOLD) {
  const n = attempts.length;
  if (n === 0) {
    return { score: 0, status: 'not_started', attempts: 0, correct: 0, hard_correct: 0 };
  }

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    // oldest → newest; IEEE-754 addition is not associative, so the order is part of the spec
    const weight = DIFFICULTY_WEIGHT[attempts[i].difficulty] * RECENCY_DECAY ** (n - 1 - i);
    denominator += weight;
    if (attempts[i].correct) numerator += weight;
  }

  const score = round2((100 * numerator) / denominator);
  const correct = attempts.filter((a) => a.correct).length;
  const hardCorrect = attempts.filter((a) => a.correct && a.difficulty === 'hard').length;

  const mastered =
    score >= threshold &&
    n >= MIN_ATTEMPTS_FOR_MASTERY &&
    hardCorrect >= MIN_HARD_CORRECT_FOR_MASTERY;

  return {
    score,
    status: mastered ? 'mastered' : 'learning',
    attempts: n,
    correct,
    hard_correct: hardCorrect,
  };
}

/* ------------------------------------------------------------- difficulty */

export const PROMOTE_AFTER = 2;
export const DEMOTE_AFTER = 2;
export const ROUTE_AFTER_WRONG_AT_EASY = 3;

/**
 * @param {{difficulty: string, consecutive_correct: number, consecutive_wrong: number}} state
 */
export function nextDifficulty(state) {
  const { difficulty, consecutive_correct: right, consecutive_wrong: wrong } = state;

  if (difficulty === 'easy' && wrong >= ROUTE_AFTER_WRONG_AT_EASY) {
    return {
      difficulty: 'easy',
      action: 'route_to_prerequisite',
      consecutive_correct: 0,
      consecutive_wrong: 0,
    };
  }

  if (wrong >= DEMOTE_AFTER) {
    const lower = demote(difficulty);
    return lower !== difficulty
      ? { difficulty: lower, action: 'demote', consecutive_correct: 0, consecutive_wrong: 0 }
      : // already at the floor: keep counting so we can reach route_to_prerequisite
        { difficulty: 'easy', action: 'stay', consecutive_correct: 0, consecutive_wrong: wrong };
  }

  if (right >= PROMOTE_AFTER) {
    const higher = promote(difficulty);
    return higher !== difficulty
      ? { difficulty: higher, action: 'promote', consecutive_correct: 0, consecutive_wrong: 0 }
      : { difficulty: 'hard', action: 'stay', consecutive_correct: right, consecutive_wrong: 0 };
  }

  return {
    difficulty,
    action: 'stay',
    consecutive_correct: right,
    consecutive_wrong: wrong,
  };
}

/* ------------------------------------------------------------- diagnostic */

export const MAX_DIAGNOSTIC_QUESTIONS = 15;
export const PROBE_SIZE = 3;
export const PROBE_PASS_MARK = 2;

/**
 * Binary search over a topologically sorted candidate list. Prerequisites sort before their
 * dependents, so a pass at index i is evidence about everything below it and a fail is evidence
 * about everything above it.
 */
export function diagnosticNext(state) {
  const {
    candidates,
    lo,
    hi,
    asked,
    max_questions: maxQuestions = MAX_DIAGNOSTIC_QUESTIONS,
    probe_size: probeSize = PROBE_SIZE,
  } = state;

  if (asked + probeSize > maxQuestions) return { action: 'finish', lo, hi };
  if (hi - lo <= 1) return { action: 'finish', lo, hi };

  const mid = Math.floor((lo + hi) / 2);
  return { action: 'probe', skill_code: candidates[mid], lo, hi };
}

/** Fold one completed probe into the search bounds. */
export function diagnosticApply(state, probe) {
  const index = state.candidates.indexOf(probe.skill_code);
  const passed = probe.correct >= PROBE_PASS_MARK;
  return {
    ...state,
    probes: [...state.probes, probe],
    lo: passed ? index : state.lo,
    hi: passed ? state.hi : index,
    asked: state.asked + probe.total,
  };
}

/**
 * @param {object} state
 * @param {Record<string, number>} gradeOf  skill_code -> grade_level
 */
export function diagnosticResult(state, gradeOf) {
  const { candidates, probes, lo } = state;
  const probeByCode = new Map(probes.map((p) => [p.skill_code, p]));

  const mastered = [];
  const weak = [];
  const missing = [];

  candidates.forEach((code, i) => {
    const probe = probeByCode.get(code);
    if (probe) {
      // measured evidence outranks inferred evidence
      if (probe.correct >= 2) mastered.push(code);
      else if (probe.correct === 1) weak.push(code);
      else missing.push(code);
      return;
    }
    if (i <= lo) mastered.push(code);
    else missing.push(code);
  });

  const estimatedLevel =
    lo >= 0 ? gradeOf[candidates[lo]] : Math.min(...candidates.map((c) => gradeOf[c]));

  return { estimated_level: estimatedLevel, frontier_index: lo, mastered, weak, missing };
}

/* ---------------------------------------------------------- recovery path */

/**
 * @param {{code: string, prerequisites: string[], order_index: number}[]} graph
 * @param {Record<string, string>} statuses  skill_code -> not_started|learning|mastered
 */
export function recoveryPath(graph, statuses, target) {
  const byCode = new Map(graph.map((s) => [s.code, s]));
  if (!byCode.has(target)) return [];

  const needed = new Set();
  const visit = (code) => {
    if (needed.has(code)) return;
    needed.add(code);
    for (const p of byCode.get(code)?.prerequisites ?? []) visit(p);
  };
  visit(target);

  return [...needed]
    .filter((code) => (statuses[code] ?? 'not_started') !== 'mastered')
    .sort((a, b) => byCode.get(a).order_index - byCode.get(b).order_index);
}

/* ------------------------------------------------------------------- elo */

export const K_STUDENT = 32;
export const K_ITEM = 8;

export function eloUpdate(theta, itemElo, correct) {
  const expected = 1 / (1 + 10 ** ((itemElo - theta) / 400));
  const c = correct ? 1 : 0;
  return {
    theta: round2(theta + K_STUDENT * (c - expected)),
    item_elo: round2(itemElo + K_ITEM * (expected - c)),
  };
}

/* ---------------------------------------------------------------- review */

export const REVIEW_INTERVALS_DAYS = [7, 21, 60];
const DAY_SECONDS = 86400;

/** @param {number} masteredAt unix seconds  @param {number} reviewCount 0-based */
export function nextReviewAt(masteredAt, reviewCount) {
  const i = Math.min(reviewCount, REVIEW_INTERVALS_DAYS.length - 1);
  return masteredAt + REVIEW_INTERVALS_DAYS[i] * DAY_SECONDS;
}
