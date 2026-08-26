import type { DiagnosticDecision, DiagnosticOutcome, DiagnosticState, Probe } from './types';

/**
 * Locates a student's real working level by binary search over a topologically sorted skill list.
 *
 * Prerequisites always sort before their dependents, so a pass at index i is evidence about
 * everything below it and a fail is evidence about everything above it. That turns "what does this
 * child actually know" into O(log n) probes — around twelve questions instead of a forty-question
 * placement paper a displaced student will never sit through.
 *
 * @see engine-spec/SPEC.md#3
 */

export const MAX_DIAGNOSTIC_QUESTIONS = 15;
export const PROBE_SIZE = 3;

/** 2 of 3. One lucky guess should not promote a skill; one slip should not condemn it. */
export const PROBE_PASS_MARK = 2;

export function startDiagnostic(
  grade: number,
  candidates: readonly string[],
  maxQuestions: number = MAX_DIAGNOSTIC_QUESTIONS,
  probeSize: number = PROBE_SIZE,
): DiagnosticState {
  return {
    grade,
    candidates,
    probes: [],
    lo: -1,
    hi: candidates.length,
    asked: 0,
    max_questions: maxQuestions,
    probe_size: probeSize,
  };
}

export function diagnosticNext(state: DiagnosticState): DiagnosticDecision {
  const { lo, hi } = state;

  // Never start a probe that cannot be finished inside the budget.
  const outOfBudget = state.asked + state.probe_size > state.max_questions;

  // Frontier located: the highest pass and the lowest fail are now adjacent.
  const frontierFound = hi - lo <= 1;

  if (outOfBudget || frontierFound) {
    return { action: 'finish', lo, hi };
  }

  const mid = Math.floor((lo + hi) / 2);

  return { action: 'probe', skill_code: state.candidates[mid], lo, hi };
}

/** Folds one completed probe into the search bounds. */
export function diagnosticApply(state: DiagnosticState, probe: Probe): DiagnosticState {
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

export function diagnosticResult(
  state: DiagnosticState,
  gradeOf: Readonly<Record<string, number>>,
): DiagnosticOutcome {
  const probeByCode = new Map(state.probes.map((p) => [p.skill_code, p]));

  const mastered: string[] = [];
  const weak: string[] = [];
  const missing: string[] = [];

  state.candidates.forEach((code, i) => {
    const probe = probeByCode.get(code);

    if (probe) {
      // Measured evidence outranks inferred evidence.
      if (probe.correct >= 2) mastered.push(code);
      else if (probe.correct === 1) weak.push(code);
      else missing.push(code);
      return;
    }

    if (i <= state.lo) mastered.push(code);
    else missing.push(code);
  });

  const estimatedLevel =
    state.lo >= 0
      ? gradeOf[state.candidates[state.lo]]
      : Math.min(...state.candidates.map((c) => gradeOf[c]));

  return {
    estimated_level: estimatedLevel,
    frontier_index: state.lo,
    mastered,
    weak,
    missing,
  };
}
