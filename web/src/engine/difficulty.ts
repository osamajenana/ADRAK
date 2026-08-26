import type { Difficulty, DifficultyDecision } from './types';
import { DIFFICULTIES } from './types';

/**
 * Chooses the difficulty of the next exercise.
 *
 * @see engine-spec/SPEC.md#2
 */

export const PROMOTE_AFTER = 2;
export const DEMOTE_AFTER = 2;
export const ROUTE_AFTER_WRONG_AT_EASY = 3;

const promote = (d: Difficulty): Difficulty =>
  DIFFICULTIES[Math.min(DIFFICULTIES.indexOf(d) + 1, DIFFICULTIES.length - 1)];

const demote = (d: Difficulty): Difficulty =>
  DIFFICULTIES[Math.max(DIFFICULTIES.indexOf(d) - 1, 0)];

/**
 * The caller increments the relevant counter for the answer just given, then calls this.
 * First matching rule wins.
 */
export function nextDifficulty(state: {
  difficulty: Difficulty;
  consecutive_correct: number;
  consecutive_wrong: number;
}): DifficultyDecision {
  const { difficulty, consecutive_correct: right, consecutive_wrong: wrong } = state;

  // Three wrong in a row at the easiest level means the gap sits BELOW this skill. More practice
  // here is just a child failing repeatedly, which is the experience this product exists to end.
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
      : // Already at the floor. The wrong-counter is deliberately NOT reset, so it can keep
        // climbing to the routing threshold above.
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

/** Applies one answer to a running difficulty state. */
export function advance(current: DifficultyDecision, correct: boolean): DifficultyDecision {
  return nextDifficulty({
    difficulty: current.difficulty,
    consecutive_correct: correct ? current.consecutive_correct + 1 : 0,
    consecutive_wrong: correct ? 0 : current.consecutive_wrong + 1,
  });
}

export const initialDecision = (): DifficultyDecision => ({
  // Starts easy. A child told for two years that they are behind should meet a question they can
  // answer first; two correct answers reach medium within a minute.
  difficulty: 'easy',
  action: 'stay',
  consecutive_correct: 0,
  consecutive_wrong: 0,
});
