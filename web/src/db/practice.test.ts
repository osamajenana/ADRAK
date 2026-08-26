import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import type { Difficulty } from '@/engine/types';
import { currentDecision, nextQuestion, recordAnswer } from './practice';
import { db, type LocalQuestion, progressKey } from './schema';

/**
 * The offline promise, tested.
 *
 * Nothing here touches the network. A student answers, sees their mastery move and unlocks the next
 * skill entirely on the device — and the outbox fills up so the server hears about it later.
 */

const PROFILE = 1;
const SKILL = 'FRC.ADD.UNLIKE';
const NEXT_SKILL = 'FRC.MIXED';

let nextId = 1;

function question(difficulty: Difficulty): LocalQuestion {
  const id = nextId++;

  return {
    id,
    skill_code: SKILL,
    type: 'mcq',
    difficulty,
    stem_ar: 'احسب ناتج الجمع في أبسط صورة:',
    expression: '1/2 + 1/3',
    hint_ar: 'وحّد المقامين أولاً.',
    explanation_ar: 'الناتج 5/6.',
    options: [
      { id: id * 10 + 1, text_ar: '5/6', is_correct: true },
      { id: id * 10 + 2, text_ar: '2/5', is_correct: false },
    ],
  };
}

/** Answers the next question at whatever difficulty the engine has the student on. */
async function answerNext(correct: boolean): Promise<void> {
  const q = await nextQuestion(PROFILE, SKILL);
  if (!q) throw new Error('no question available');

  const option = q.options.find((o) => o.is_correct === correct);
  await recordAnswer(PROFILE, q, option?.id ?? null);
}

beforeEach(async () => {
  await db.delete();
  await db.open();

  nextId = 1;

  await db.skills.bulkPut([
    {
      code: SKILL,
      name_ar: 'جمع وطرح كسور مختلفة المقامات',
      description_ar: '',
      strand: 'fractions',
      grade_level: 6,
      order_index: 14,
      depth: 6,
      is_spine: true,
      prerequisites: [],
    },
    {
      code: NEXT_SKILL,
      name_ar: 'الأعداد الكسرية',
      description_ar: '',
      strand: 'fractions',
      grade_level: 6,
      order_index: 15,
      depth: 7,
      is_spine: true,
      prerequisites: [SKILL],
    },
  ]);

  // Enough at each level that the pool never runs dry mid-climb.
  await db.questions.bulkPut([
    ...Array.from({ length: 6 }, () => question('easy')),
    ...Array.from({ length: 6 }, () => question('medium')),
    ...Array.from({ length: 6 }, () => question('hard')),
  ]);

  await db.pathItems.bulkPut([
    {
      key: `${PROFILE}:${SKILL}`,
      profileId: PROFILE,
      skill_code: SKILL,
      name_ar: 'جمع كسور',
      order_index: 0,
      status: 'current',
    },
    {
      key: `${PROFILE}:${NEXT_SKILL}`,
      profileId: PROFILE,
      skill_code: NEXT_SKILL,
      name_ar: 'أعداد كسرية',
      order_index: 1,
      status: 'locked',
    },
  ]);
});

describe('practising with no network', () => {
  it('starts a new skill at the easiest level', async () => {
    // A child told for two years that they are behind meets a winnable question first.
    expect((await currentDecision(PROFILE, SKILL)).difficulty).toBe('easy');
  });

  it('climbs through the levels and reaches mastery on the device', async () => {
    const seen: Difficulty[] = [];

    for (let i = 0; i < 8; i++) {
      const q = await nextQuestion(PROFILE, SKILL);
      if (!q) throw new Error('no question available');

      seen.push(q.difficulty);
      await recordAnswer(PROFILE, q, q.options.find((o) => o.is_correct)?.id ?? null);
    }

    expect(seen).toContain('easy');
    expect(seen).toContain('medium');
    expect(seen).toContain('hard');

    const progress = await db.progress.get(progressKey(PROFILE, SKILL));

    expect(progress?.status).toBe('mastered');
    expect(progress?.mastery_score).toBe(100);
    expect(progress?.hard_correct).toBeGreaterThanOrEqual(2);
  });

  it('refuses to call a skill mastered on easy questions alone', async () => {
    // Ten perfect answers, all easy. Same guard the server applies, reached independently.
    const easy = await db.questions.where({ skill_code: SKILL, difficulty: 'easy' }).toArray();

    for (let i = 0; i < 10; i++) {
      const q = easy[i % easy.length];
      await recordAnswer(PROFILE, q, q.options.find((o) => o.is_correct)?.id ?? null);
    }

    const progress = await db.progress.get(progressKey(PROFILE, SKILL));

    expect(progress?.mastery_score).toBe(100);
    expect(progress?.hard_correct).toBe(0);
    expect(progress?.status).toBe('learning');
  });

  it('unlocks the next path step the moment the skill is mastered', async () => {
    for (let i = 0; i < 8; i++) await answerNext(true);

    const items = await db.pathItems.where({ profileId: PROFILE }).sortBy('order_index');

    expect(items[0]?.status).toBe('done');
    expect(items[1]?.status).toBe('current');
  });

  it('queues every answer for the server without waiting for one', async () => {
    for (let i = 0; i < 5; i++) await answerNext(true);

    const outbox = await db.outbox.where({ profileId: PROFILE }).sortBy('client_seq');

    expect(outbox).toHaveLength(5);
    expect(outbox.every((e) => e.type === 'exercise_attempt')).toBe(true);

    // Strictly increasing, so the server replays the week in the order it was lived.
    const seqs = outbox.map((e) => e.client_seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(new Set(seqs).size).toBe(seqs.length);

    // UUIDv7: version nibble 7 in the third group. Time-ordered, so the server's primary key
    // index stays append-friendly.
    expect(outbox[0]?.id[14]).toBe('7');
  });

  it('keeps two students on one phone completely apart', async () => {
    const sibling = 2;

    for (let i = 0; i < 4; i++) await answerNext(true);

    const q = await nextQuestion(sibling, SKILL);
    if (!q) throw new Error('no question available');
    await recordAnswer(sibling, q, q.options.find((o) => !o.is_correct)?.id ?? null);

    const mine = await db.progress.get(progressKey(PROFILE, SKILL));
    const theirs = await db.progress.get(progressKey(sibling, SKILL));

    expect(mine?.correct_answers).toBe(4);
    expect(theirs?.correct_answers).toBe(0);

    // And neither sees the other's attempts at all.
    expect(await db.attempts.where({ profileId: PROFILE }).count()).toBe(4);
    expect(await db.attempts.where({ profileId: sibling }).count()).toBe(1);
  });

  it('recovers the exact difficulty after the app is closed and reopened', async () => {
    for (let i = 0; i < 4; i++) await answerNext(true);

    const before = await currentDecision(PROFILE, SKILL);

    // Simulates a dead battery: nothing in memory survives, only what reached IndexedDB.
    await db.close();
    await db.open();

    expect(await currentDecision(PROFILE, SKILL)).toEqual(before);
  });
});
