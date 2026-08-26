import { round2 } from './num';

/**
 * Keeps the question bank calibrated as students use it.
 *
 * Elo NEVER decides mastery — it only orders candidate questions within a skill. A miscalibrated
 * item can waste a student's minute; it cannot tell them they have mastered something they have not.
 *
 * @see engine-spec/SPEC.md#5
 */

export const K_STUDENT = 32;

/** The item drifts a quarter as fast as the student, so one answer cannot jerk it around. */
export const K_ITEM = 8;

export function eloUpdate(
  theta: number,
  itemElo: number,
  correct: boolean,
): { theta: number; item_elo: number } {
  const expected = 1 / (1 + 10 ** ((itemElo - theta) / 400));
  const c = correct ? 1 : 0;

  return {
    theta: round2(theta + K_STUDENT * (c - expected)),
    item_elo: round2(itemElo + K_ITEM * (expected - c)),
  };
}
