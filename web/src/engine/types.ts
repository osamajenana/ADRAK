/**
 * Shared vocabulary for the adaptive engine.
 *
 * Literal unions rather than TypeScript enums: an enum emits a runtime object, and this bundle is
 * capped at 200 KB gzipped because it has to reach a student on 2G. These compile to nothing.
 *
 * @see engine-spec/SPEC.md
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type MasteryStatus = 'not_started' | 'learning' | 'mastered';

export type DifficultyAction = 'stay' | 'promote' | 'demote' | 'route_to_prerequisite';

export type DiagnosticAction = 'probe' | 'finish';

/** Ordered easy < medium < hard. */
export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard'] as const;

export interface Attempt {
  readonly correct: boolean;
  readonly difficulty: Difficulty;
}

export interface MasteryResult {
  readonly score: number;
  readonly status: MasteryStatus;
  readonly attempts: number;
  readonly correct: number;
  readonly hard_correct: number;
}

export interface DifficultyDecision {
  readonly difficulty: Difficulty;
  readonly action: DifficultyAction;
  readonly consecutive_correct: number;
  readonly consecutive_wrong: number;
}

export interface Probe {
  readonly skill_code: string;
  readonly correct: number;
  readonly total: number;
}

export interface DiagnosticState {
  readonly grade: number;
  readonly candidates: readonly string[];
  readonly probes: readonly Probe[];
  /** Highest passed index, -1 if none. Exclusive lower bound. */
  readonly lo: number;
  /** Lowest failed index, candidates.length if none. Exclusive upper bound. */
  readonly hi: number;
  readonly asked: number;
  readonly max_questions: number;
  readonly probe_size: number;
}

export interface DiagnosticDecision {
  readonly action: DiagnosticAction;
  readonly skill_code?: string;
  readonly lo: number;
  readonly hi: number;
}

export interface DiagnosticOutcome {
  readonly estimated_level: number;
  readonly frontier_index: number;
  readonly mastered: string[];
  /** Partial knowledge — worth revisiting rather than reteaching from scratch. */
  readonly weak: string[];
  readonly missing: string[];
}

export interface GraphSkill {
  readonly code: string;
  readonly order_index: number;
  readonly prerequisites: readonly string[];
}
