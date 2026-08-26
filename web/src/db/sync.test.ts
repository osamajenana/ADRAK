import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordAnswer } from './practice';
import { db, type LocalQuestion, progressKey } from './schema';
import { drainOutbox, pendingCount } from './sync';

/**
 * Draining a week of offline work.
 *
 * The send function is injected rather than imported, so these run with no network at all — the
 * same reason the engine takes timestamps instead of reading a clock.
 */

const PROFILE = 1;
const SKILL = 'FRC.ADD.UNLIKE';

const question = (id: number): LocalQuestion => ({
  id,
  skill_code: SKILL,
  type: 'mcq',
  difficulty: 'easy',
  stem_ar: 'احسب',
  expression: '1/2 + 1/3',
  hint_ar: null,
  explanation_ar: 'الناتج 5/6.',
  options: [
    { id: id * 10 + 1, text_ar: '5/6', is_correct: true },
    { id: id * 10 + 2, text_ar: '2/5', is_correct: false },
  ],
});

const serverAccepts = (accepted: number) =>
  vi.fn(async (_body: unknown) => ({
    ok: true as const,
    data: {
      accepted,
      duplicates: 0,
      rejected: 0,
      last_client_seq: accepted,
      state: {
        progress: { [SKILL]: { status: 'learning' as const, mastery_score: 62.5 } },
        learning_path: {
          target_skill_code: SKILL,
          items: [
            {
              skill_code: SKILL,
              name_ar: 'جمع كسور',
              order_index: 0,
              status: 'current' as const,
            },
          ],
        },
      },
    },
  }));

const serverUnreachable = () =>
  vi.fn(async (_body: unknown) => ({ ok: false as const, offline: true }));

async function answer(count: number): Promise<void> {
  for (let i = 0; i < count; i++) {
    const q = question(i + 1);
    await db.questions.put(q);
    await recordAnswer(PROFILE, q, q.options[0].id);
  }
}

beforeEach(async () => {
  await db.delete();
  await db.open();

  await db.skills.put({
    code: SKILL,
    name_ar: 'جمع وطرح كسور مختلفة المقامات',
    description_ar: '',
    strand: 'fractions',
    grade_level: 6,
    order_index: 14,
    depth: 6,
    is_spine: true,
    prerequisites: [],
  });
});

describe('draining the outbox', () => {
  it('sends queued work in the order it was done', async () => {
    await answer(5);

    const send = serverAccepts(5);
    const summary = await drainOutbox(PROFILE, send);

    expect(summary.outcome).toBe('synced');
    expect(summary.sent).toBe(5);

    const body = send.mock.calls[0][0] as {
      device_id: string;
      events: Array<{ client_seq: number }>;
    };

    expect(body.device_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.events.map((e) => e.client_seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('clears the queue once the server has the work', async () => {
    await answer(4);
    expect(await pendingCount(PROFILE)).toBe(4);

    await drainOutbox(PROFILE, serverAccepts(4));

    expect(await pendingCount(PROFILE)).toBe(0);
    expect(await db.attempts.where({ profileId: PROFILE, synced: 1 }).count()).toBe(4);
  });

  it('keeps everything when there is no connection', async () => {
    await answer(3);

    const summary = await drainOutbox(PROFILE, serverUnreachable());

    expect(summary.outcome).toBe('offline');
    expect(await pendingCount(PROFILE)).toBe(3);

    // Counted, so one permanently unacceptable event cannot sit at the head of the queue forever
    // and hold a student's whole week behind it.
    const queued = await db.outbox.where({ profileId: PROFILE }).toArray();
    expect(queued.every((e) => e.attempts === 1)).toBe(true);
  });

  it('re-sends nothing after a successful drain', async () => {
    await answer(3);
    await drainOutbox(PROFILE, serverAccepts(3));

    const second = serverAccepts(0);
    const summary = await drainOutbox(PROFILE, second);

    expect(summary.outcome).toBe('nothing-to-send');
    expect(second).not.toHaveBeenCalled();
  });

  it('adopts the server as the authority on progress', async () => {
    await answer(2);

    // Locally this is 100 with 2 attempts. The server has seen work from a sibling's phone that
    // this device never did, so its figure is the one the teacher is looking at.
    await drainOutbox(PROFILE, serverAccepts(2));

    const progress = await db.progress.get(progressKey(PROFILE, SKILL));

    expect(progress?.mastery_score).toBe(62.5);
    expect(progress?.status).toBe('learning');
  });

  it('replaces the path with the server copy', async () => {
    await answer(1);
    await drainOutbox(PROFILE, serverAccepts(1));

    const items = await db.pathItems.where({ profileId: PROFILE }).toArray();

    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe('current');
  });

  it("never sends one profile's work under another profile", async () => {
    await answer(3);

    const sibling = 2;
    const q = question(99);
    await db.questions.put(q);
    await recordAnswer(sibling, q, q.options[0].id);

    const send = serverAccepts(3);
    await drainOutbox(PROFILE, send);

    const body = send.mock.calls[0][0] as { events: unknown[] };

    expect(body.events).toHaveLength(3);
    expect(await pendingCount(sibling)).toBe(1);
  });

  it('leaves the attempt log alone — it is the record, not a cache', async () => {
    await answer(4);
    await drainOutbox(PROFILE, serverAccepts(4));

    // The server's progress figure replaced the derived score, but the attempts that produced it
    // are still here. A device that loses its queue must not also lose its history.
    expect(await db.attempts.where({ profileId: PROFILE }).count()).toBe(4);
  });
});
