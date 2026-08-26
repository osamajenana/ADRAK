import Dexie, { type EntityTable } from 'dexie';
import type { Difficulty, MasteryStatus } from '@/engine/types';

/**
 * The local database. On a student's device this is not a cache — it is where their work lives.
 *
 * Everything a student does is written here first and synced later, because "later" in Gaza can
 * mean next week. The server is the eventual authority, never the immediate one: a child who
 * answers thirty questions in a tent with no signal must see their progress move, their skill
 * unlock and their path advance, right then.
 *
 * SHARED DEVICES: five siblings on one phone is the normal case, so every row carries `profileId`
 * and every index is compound on it. One student can never read or overwrite another's work, even
 * though they share the physical device — the isolation is in the key, not in the UI.
 */

export interface LocalSkill {
  code: string;
  name_ar: string;
  description_ar: string;
  strand: string;
  grade_level: number;
  order_index: number;
  /** Layout column for the Skill Map. Precomputed server-side so a weak phone is not finding longest paths. */
  depth: number;
  is_spine: boolean;
  prerequisites: string[];
}

export interface LocalQuestion {
  id: number;
  skill_code: string;
  type: string;
  difficulty: Difficulty;
  stem_ar: string;
  /** Kept apart from the Arabic prose so it can be rendered in its own LTR run. */
  expression: string | null;
  hint_ar: string | null;
  explanation_ar: string | null;
  options: LocalOption[];
}

export interface LocalOption {
  id: number;
  text_ar: string;
  /** Present because grading happens on the device. See QuestionResource for why that is safe here. */
  is_correct: boolean;
}

export interface LocalProgress {
  /** `${profileId}:${skill_code}` — Dexie needs a scalar primary key for put(). */
  key: string;
  profileId: number;
  skill_code: string;
  mastery_score: number;
  attempts: number;
  correct_answers: number;
  hard_correct: number;
  status: MasteryStatus;
  mastered_at: number | null;
}

export interface LocalAttempt {
  id?: number;
  profileId: number;
  skill_code: string;
  question_id: number;
  option_id: number | null;
  is_correct: boolean;
  difficulty_at_attempt: Difficulty;
  /**
   * Per-device monotonic counter. THIS is what orders a student's history — not a timestamp.
   * Shared phones lose power for days and come back with the clock at 1970 or 2099.
   */
  client_seq: number;
  client_created_at: number;
  synced: 0 | 1;
}

export interface LocalPathItem {
  key: string;
  profileId: number;
  skill_code: string;
  name_ar: string;
  order_index: number;
  status: 'locked' | 'current' | 'done';
}

export interface OutboxEvent {
  /** Client-minted UUIDv7. Time-ordered, and the server's idempotency key. */
  id: string;
  profileId: number;
  client_seq: number;
  type: 'exercise_attempt' | 'diagnostic_answer' | 'skill_mastered';
  payload: unknown;
  client_created_at: number;
  attempts: number;
}

export interface LocalProfile {
  id: number;
  display_name: string;
  grade: number;
  token: string;
  classroom_id: number | null;
  last_used_at: number;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class NabdDatabase extends Dexie {
  skills!: EntityTable<LocalSkill, 'code'>;
  questions!: EntityTable<LocalQuestion, 'id'>;
  progress!: EntityTable<LocalProgress, 'key'>;
  attempts!: EntityTable<LocalAttempt, 'id'>;
  pathItems!: EntityTable<LocalPathItem, 'key'>;
  outbox!: EntityTable<OutboxEvent, 'id'>;
  profiles!: EntityTable<LocalProfile, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor(name = 'nabd') {
    super(name);

    this.version(1).stores({
      skills: 'code, order_index, grade_level, depth',
      questions: 'id, skill_code, [skill_code+difficulty]',
      progress: 'key, profileId, [profileId+status], [profileId+skill_code]',
      attempts: '++id, profileId, [profileId+skill_code], [profileId+synced], client_seq',
      pathItems: 'key, profileId, [profileId+order_index], [profileId+status]',
      // Drained oldest-first, so the server replays a student's week in the order they lived it.
      outbox: 'id, profileId, client_seq, [profileId+client_seq]',
      profiles: 'id, last_used_at',
      meta: 'key',
    });
  }
}

export const db = new NabdDatabase();

export const progressKey = (profileId: number, skillCode: string): string =>
  `${profileId}:${skillCode}`;
