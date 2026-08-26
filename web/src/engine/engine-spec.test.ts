import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  diagnosticApply,
  diagnosticNext,
  diagnosticResult,
  eloUpdate,
  masteryScore,
  nextDifficulty,
  nextReviewAt,
  recoveryPath,
  startDiagnostic,
} from './index';
import type { Attempt, DiagnosticState, Difficulty, GraphSkill, MasteryStatus } from './types';

/**
 * Conformance suite for engine-spec/.
 *
 * These are the SAME files api/tests/Unit/EngineSpecTest.php replays under Pest. Two independent
 * implementations of the same rules drift silently, and engine drift does not surface as an error —
 * it surfaces as a student told they mastered a skill on their phone and not on the server.
 *
 * A vector is never edited to make a test pass. Change SPEC.md, regenerate, re-run both suites.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC_DIR = join(HERE, '..', '..', '..', 'engine-spec');

// biome-ignore lint/suspicious/noExplicitAny: vector files are untyped JSON by design
type Vector = any;

const load = (name: string): Vector =>
  JSON.parse(readFileSync(join(SPEC_DIR, 'vectors', `${name}.json`), 'utf8'));

const miniGraph = (): GraphSkill[] =>
  JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures', 'mini-graph.json'), 'utf8')).skills;

const gradeLookup = (): Record<string, number> =>
  Object.fromEntries(
    JSON.parse(readFileSync(join(SPEC_DIR, 'fixtures', 'mini-graph.json'), 'utf8')).skills.map(
      (s: { code: string; grade_level: number }) => [s.code, s.grade_level],
    ),
  );

/* -------------------------------------------------------------------- §1 */

describe('mastery', () => {
  for (const testCase of load('mastery').cases) {
    it(testCase.name, () => {
      const result = masteryScore(
        testCase.input.attempts as Attempt[],
        testCase.input.threshold as number,
      );

      // Exact equality, not a tolerance. A tolerance would hide precisely the drift that matters:
      // a student sitting on the threshold flipping verdict depending on which device scored them.
      expect(result.score).toBe(testCase.expected.score);
      expect(result.status).toBe(testCase.expected.status);
      expect(result.attempts).toBe(testCase.expected.attempts);
      expect(result.correct).toBe(testCase.expected.correct);
      expect(result.hard_correct).toBe(testCase.expected.hard_correct);
    });
  }
});

/* -------------------------------------------------------------------- §2 */

describe('difficulty', () => {
  for (const testCase of load('difficulty').cases) {
    it(testCase.name, () => {
      expect(
        nextDifficulty({
          difficulty: testCase.input.difficulty as Difficulty,
          consecutive_correct: testCase.input.consecutive_correct,
          consecutive_wrong: testCase.input.consecutive_wrong,
        }),
      ).toEqual(testCase.expected);
    });
  }
});

/* -------------------------------------------------------------------- §3 */

describe('diagnostic', () => {
  for (const testCase of load('diagnostic').cases) {
    it(testCase.name, () => {
      let state: DiagnosticState = startDiagnostic(
        testCase.input.grade,
        testCase.input.candidates,
        testCase.input.max_questions,
        testCase.input.probe_size,
      );

      testCase.steps.forEach((step: Vector, i: number) => {
        expect({ lo: state.lo, hi: state.hi, asked: state.asked }, `before step ${i}`).toEqual(
          step.before,
        );

        const decision = diagnosticNext(state);

        // `skill_code` is absent entirely on finish, so compare the object rather than its fields.
        expect(JSON.parse(JSON.stringify(decision)), `decision at step ${i}`).toEqual(
          step.decision,
        );

        if (step.probe) state = diagnosticApply(state, step.probe);
      });

      expect(diagnosticResult(state, gradeLookup())).toEqual(testCase.expected_result);
    });
  }
});

/* -------------------------------------------------------------------- §4 */

describe('recovery path', () => {
  for (const testCase of load('recovery-path').cases) {
    it(testCase.name, () => {
      expect(
        recoveryPath(
          miniGraph(),
          testCase.input.statuses as Record<string, MasteryStatus>,
          testCase.input.target,
        ),
      ).toEqual(testCase.expected);
    });
  }
});

/* -------------------------------------------------------------------- §5 */

describe('elo', () => {
  for (const testCase of load('elo').cases) {
    it(testCase.name, () => {
      const result = eloUpdate(
        testCase.input.theta,
        testCase.input.item_elo,
        testCase.input.correct,
      );

      expect(result.theta).toBe(testCase.expected.theta);
      expect(result.item_elo).toBe(testCase.expected.item_elo);
    });
  }
});

/* -------------------------------------------------------------------- §6 */

describe('spaced review', () => {
  for (const testCase of load('review').cases) {
    it(testCase.name, () => {
      expect(nextReviewAt(testCase.input.mastered_at, testCase.input.review_count)).toBe(
        testCase.expected,
      );
    });
  }
});
