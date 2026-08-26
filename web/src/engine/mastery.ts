import { round2 } from './num';
import type { Attempt, Difficulty, MasteryResult } from './types';

/**
 * Decides whether a student has mastered a skill.
 *
 * Three conditions, all of which a teacher can check by hand off the screen — that is the design
 * constraint, not an implementation detail. A teacher who cannot see WHY the system says
 * "mastered" will not trust it, and a recovery plan a teacher does not trust does not get taught.
 *
 * @see engine-spec/SPEC.md#1
 */

export const DEFAULT_MASTERY_THRESHOLD = 85;

/** Blocks mastery declared on a thin sample. */
export const MIN_ATTEMPTS_FOR_MASTERY = 8;

/** Blocks mastery that was never tested at depth. */
export const MIN_HARD_CORRECT_FOR_MASTERY = 2;

const RECENCY_DECAY = 0.9;

const DIFFICULTY_WEIGHT: Record<Difficulty, number> = {
  easy: 1.0,
  medium: 1.5,
  hard: 2.0,
};

/** @param attempts oldest first — the traversal order is part of the spec. */
export function masteryScore(
  attempts: readonly Attempt[],
  threshold: number = DEFAULT_MASTERY_THRESHOLD,
): MasteryResult {
  const n = attempts.length;

  if (n === 0) {
    return { score: 0, status: 'not_started', attempts: 0, correct: 0, hard_correct: 0 };
  }

  let numerator = 0;
  let denominator = 0;
  let correct = 0;
  let hardCorrect = 0;

  for (let i = 0; i < n; i++) {
    const attempt = attempts[i];

    // Oldest to newest. IEEE-754 addition is not associative, so a different traversal shifts the
    // second decimal — and the server is adding these up in the same order.
    const weight = DIFFICULTY_WEIGHT[attempt.difficulty] * RECENCY_DECAY ** (n - 1 - i);
    denominator += weight;

    if (attempt.correct) {
      numerator += weight;
      correct++;
      if (attempt.difficulty === 'hard') hardCorrect++;
    }
  }

  const score = round2((100 * numerator) / denominator);

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
