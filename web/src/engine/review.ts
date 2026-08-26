/**
 * Schedules the spaced review of a mastered skill.
 *
 * Retention, not just attainment: a skill reached in March and never revisited is gone by June.
 *
 * Deliberately not SM-2 — that needs a self-rated recall quality, and asking a twelve-year-old in a
 * tent school to grade their own memory produces a number nobody should schedule on.
 *
 * Takes the timestamp rather than reading the clock, which is what lets the client and the server
 * agree when the same history is replayed on both.
 *
 * @see engine-spec/SPEC.md#6
 */

export const REVIEW_INTERVALS_DAYS = [7, 21, 60] as const;

const DAY_SECONDS = 86400;

/** @param masteredAt unix seconds @param reviewCount 0-based */
export function nextReviewAt(masteredAt: number, reviewCount: number): number {
  const i = Math.min(reviewCount, REVIEW_INTERVALS_DAYS.length - 1);

  return masteredAt + REVIEW_INTERVALS_DAYS[i] * DAY_SECONDS;
}
