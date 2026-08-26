import { advance, initialDecision } from '@/engine/difficulty';
import { masteryScore } from '@/engine/mastery';
import type { Attempt, DifficultyDecision, MasteryStatus } from '@/engine/types';
import { nextClientSeq, uuidv7 } from './meta';
import {
  db,
  type LocalAttempt,
  type LocalProgress,
  type LocalQuestion,
  progressKey,
} from './schema';

/**
 * Practice, offline.
 *
 * This is the mirror of the server's ExerciseService, running on the student's device. It is what
 * makes the product's central promise true: a child in a tent with no signal answers a question,
 * sees whether they were right, watches their mastery move and unlocks the next skill — now, not
 * next week when a connection appears.
 *
 * The rules come from @/engine, which is verified against the same vectors the server is, so what
 * happens here and what the server later computes from the synced log are the same thing.
 */

export interface AnswerOutcome {
  isCorrect: boolean;
  explanation: string | null;
  decision: DifficultyDecision;
  progress: LocalProgress;
  /** True the moment this answer tipped the skill over. The screen celebrates on this. */
  justMastered: boolean;
}

/** Replays this skill's attempts to find where the student currently stands. */
export async function currentDecision(
  profileId: number,
  skillCode: string,
): Promise<DifficultyDecision> {
  const attempts = await orderedAttempts(profileId, skillCode);

  return attempts.reduce<DifficultyDecision>(
    (decision, attempt) => advance(decision, attempt.is_correct),
    initialDecision(),
  );
}

/**
 * The next question: right skill, right difficulty, not one they just saw.
 *
 * Falls back to reusing a recent item rather than returning nothing. A blank screen is a worse
 * answer than a repeat, and a student who has exhausted a level is about to be promoted anyway.
 */
export async function nextQuestion(
  profileId: number,
  skillCode: string,
): Promise<LocalQuestion | null> {
  const { difficulty } = await currentDecision(profileId, skillCode);

  const pool = await db.questions.where({ skill_code: skillCode, difficulty }).toArray();
  if (pool.length === 0) return null;

  const recent = (await orderedAttempts(profileId, skillCode)).slice(-8).map((a) => a.question_id);

  const unseen = pool.filter((q) => !recent.includes(q.id));
  const candidates = unseen.length > 0 ? unseen : pool;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Records one answer: local attempt, recomputed progress, and an outbox event for the server.
 *
 * All three in one Dexie transaction. A phone that dies mid-write must not be able to leave an
 * attempt recorded with no event queued — that answer would then exist on the device and nowhere
 * else, and the teacher would never see it.
 */
export async function recordAnswer(
  profileId: number,
  question: LocalQuestion,
  optionId: number | null,
): Promise<AnswerOutcome> {
  const option = question.options.find((o) => o.id === optionId) ?? null;
  const isCorrect = option?.is_correct ?? false;

  const before = await currentDecision(profileId, question.skill_code);
  const clientSeq = await nextClientSeq();
  const now = Math.floor(Date.now() / 1000);

  const previous = await db.progress.get(progressKey(profileId, question.skill_code));
  const wasMastered = previous?.status === 'mastered';

  const attempt: LocalAttempt = {
    profileId,
    skill_code: question.skill_code,
    question_id: question.id,
    option_id: optionId,
    is_correct: isCorrect,
    difficulty_at_attempt: question.difficulty,
    client_seq: clientSeq,
    client_created_at: now,
    synced: 0,
  };

  const progress = await db.transaction(
    'rw',
    // `skills` is in scope because unlockNext() reads each candidate's prerequisites. Dexie
    // refuses any table not declared here, and the failure only surfaces on the one answer that
    // actually tips a skill over — which is the answer that matters most.
    [db.attempts, db.progress, db.outbox, db.pathItems, db.skills],
    async () => {
      await db.attempts.add(attempt);

      const updated = await recomputeProgress(profileId, question.skill_code);

      await db.outbox.add({
        id: uuidv7(),
        profileId,
        client_seq: clientSeq,
        type: 'exercise_attempt',
        payload: {
          question_id: question.id,
          option_id: optionId,
          is_correct: isCorrect,
          difficulty_at_attempt: question.difficulty,
          client_created_at: now,
        },
        client_created_at: now,
        attempts: 0,
      });

      if (updated.status === 'mastered' && !wasMastered) {
        await unlockNext(profileId, question.skill_code);
      }

      return updated;
    },
  );

  return {
    isCorrect,
    explanation: question.explanation_ar,
    decision: advance(before, isCorrect),
    progress,
    justMastered: progress.status === 'mastered' && !wasMastered,
  };
}

/**
 * Recomputes a skill's standing from its whole attempt history.
 *
 * Recomputed rather than adjusted, exactly as the server does it. An incrementally-updated
 * aggregate drifts a little further from the truth every time an attempt arrives out of order —
 * and here they will, because the same events reach the server by three different routes.
 */
export async function recomputeProgress(
  profileId: number,
  skillCode: string,
): Promise<LocalProgress> {
  const attempts = await orderedAttempts(profileId, skillCode);

  const result = masteryScore(
    attempts.map<Attempt>((a) => ({ correct: a.is_correct, difficulty: a.difficulty_at_attempt })),
  );

  const existing = await db.progress.get(progressKey(profileId, skillCode));

  const progress: LocalProgress = {
    key: progressKey(profileId, skillCode),
    profileId,
    skill_code: skillCode,
    mastery_score: result.score,
    attempts: result.attempts,
    correct_answers: result.correct,
    hard_correct: result.hard_correct,
    status: result.status,
    mastered_at:
      result.status === 'mastered'
        ? (existing?.mastered_at ?? Math.floor(Date.now() / 1000))
        : (existing?.mastered_at ?? null),
  };

  await db.progress.put(progress);

  return progress;
}

/**
 * Opens the next path step — but only where every prerequisite is now held.
 *
 * A skill with two foundations is not ready when one of them lands.
 */
async function unlockNext(profileId: number, masteredCode: string): Promise<void> {
  await db.pathItems.where({ profileId, skill_code: masteredCode }).modify({ status: 'done' });

  const mastered = new Set(
    (await db.progress.where({ profileId, status: 'mastered' as MasteryStatus }).toArray()).map(
      (p) => p.skill_code,
    ),
  );
  mastered.add(masteredCode);

  const locked = await db.pathItems.where({ profileId, status: 'locked' }).sortBy('order_index');

  for (const item of locked) {
    const skill = await db.skills.get(item.skill_code);
    const ready = (skill?.prerequisites ?? []).every((code) => mastered.has(code));

    if (ready) {
      await db.pathItems.update(item.key, { status: 'current' });
      return;
    }
  }
}

/**
 * This skill's attempts, oldest first.
 *
 * Ordered by client_seq, which is the per-device counter — never by timestamp. The mastery score
 * weights by recency, so getting this order wrong silently changes a student's verdict.
 */
async function orderedAttempts(profileId: number, skillCode: string): Promise<LocalAttempt[]> {
  const attempts = await db.attempts.where({ profileId, skill_code: skillCode }).toArray();

  return attempts.sort((a, b) => a.client_seq - b.client_seq || (a.id ?? 0) - (b.id ?? 0));
}
