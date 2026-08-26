import type { MasteryStatus } from '@/engine/types';
import { deviceId, markSynced } from './meta';
import { db, progressKey } from './schema';

/**
 * Sending a week of offline work back to the server.
 *
 * Nothing here blocks a student. Practice writes to IndexedDB and returns; this drains the queue
 * whenever a connection appears, and if it never appears the work simply waits — which is the
 * point, because for many of these students it will not appear for days.
 */

const MAX_BATCH = 500;

/** After this many failed sends an event is set aside rather than blocking everything behind it. */
const MAX_RETRIES = 8;

export interface SyncSummary {
  sent: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  remaining: number;
  outcome: 'synced' | 'offline' | 'nothing-to-send' | 'error';
}

export interface SyncResponse {
  accepted: number;
  duplicates: number;
  rejected: number;
  last_client_seq: number;
  state: {
    progress: Record<string, { status: MasteryStatus; mastery_score: number }>;
    learning_path: {
      target_skill_code: string | null;
      items: Array<{
        skill_code: string;
        name_ar: string;
        order_index: number;
        status: 'locked' | 'current' | 'done';
      }>;
    } | null;
  };
}

/**
 * @param send injected rather than imported so tests can drive this without a network — the same
 *             reason the engine takes timestamps instead of reading a clock.
 */
export async function drainOutbox(
  profileId: number,
  send: (
    body: unknown,
  ) => Promise<{ ok: true; data: SyncResponse } | { ok: false; offline: boolean }>,
): Promise<SyncSummary> {
  const queued = await db.outbox.where({ profileId }).sortBy('client_seq');

  const sendable = queued.filter((event) => event.attempts < MAX_RETRIES).slice(0, MAX_BATCH);

  if (sendable.length === 0) {
    return {
      sent: 0,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      remaining: queued.length,
      outcome: 'nothing-to-send',
    };
  }

  const response = await send({
    device_id: await deviceId(),
    events: sendable.map((event) => ({
      id: event.id,
      client_seq: event.client_seq,
      type: event.type,
      payload: event.payload,
      client_created_at: event.client_created_at,
    })),
  });

  if (!response.ok) {
    // A failed send is counted, not punished. The counter exists so one permanently unacceptable
    // event cannot sit at the head of the queue forever and hold a student's whole week behind it.
    await db.transaction('rw', db.outbox, async () => {
      for (const event of sendable) {
        await db.outbox.update(event.id, { attempts: event.attempts + 1 });
      }
    });

    return {
      sent: sendable.length,
      accepted: 0,
      duplicates: 0,
      rejected: 0,
      remaining: queued.length,
      outcome: response.offline ? 'offline' : 'error',
    };
  }

  const { accepted, duplicates, rejected, state } = response.data;

  await db.transaction(
    'rw',
    [db.outbox, db.attempts, db.progress, db.pathItems, db.meta],
    async () => {
      // Duplicates are removed too. The server has them; keeping them would mean re-sending the same
      // bytes on every future drain over a connection that is already the scarce resource.
      await db.outbox.bulkDelete(sendable.map((event) => event.id));

      const sentSeqs = new Set(sendable.map((event) => event.client_seq));
      const local = await db.attempts.where({ profileId }).toArray();

      for (const attempt of local) {
        if (attempt.id !== undefined && sentSeqs.has(attempt.client_seq)) {
          await db.attempts.update(attempt.id, { synced: 1 });
        }
      }

      await applyCanonicalState(profileId, state);
      await markSynced(Date.now());
    },
  );

  return {
    sent: sendable.length,
    accepted,
    duplicates,
    rejected,
    remaining: queued.length - sendable.length,
    outcome: 'synced',
  };
}

/**
 * Replaces local derived state with the server's.
 *
 * Replaced, not merged. Both sides compute mastery from the same rules over the same log so they
 * agree — and where they cannot (an event the server dropped because its question no longer
 * exists), the server's answer is the one that matches what the teacher is looking at. Local
 * attempts are never touched: they are the record, and anything unsent is still in the outbox.
 */
async function applyCanonicalState(profileId: number, state: SyncResponse['state']): Promise<void> {
  const progress = Object.entries(state.progress ?? {});

  for (const [code, value] of progress) {
    const existing = await db.progress.get(progressKey(profileId, code));

    await db.progress.put({
      key: progressKey(profileId, code),
      profileId,
      skill_code: code,
      mastery_score: value.mastery_score,
      // Attempt counts stay local: they are derived from this device's log, and the server's
      // figure includes work synced from a sibling's phone that this device never saw.
      attempts: existing?.attempts ?? 0,
      correct_answers: existing?.correct_answers ?? 0,
      hard_correct: existing?.hard_correct ?? 0,
      status: value.status,
      mastered_at:
        value.status === 'mastered'
          ? (existing?.mastered_at ?? Math.floor(Date.now() / 1000))
          : null,
    });
  }

  if (state.learning_path) {
    await db.pathItems.where({ profileId }).delete();
    await db.pathItems.bulkPut(
      state.learning_path.items.map((item) => ({
        key: progressKey(profileId, item.skill_code),
        profileId,
        skill_code: item.skill_code,
        name_ar: item.name_ar,
        order_index: item.order_index,
        status: item.status,
      })),
    );
  }
}

/** How much work is waiting, for the status chip. */
export const pendingCount = (profileId: number): Promise<number> =>
  db.outbox.where({ profileId }).count();

/** Events that have failed too many times to keep retrying automatically. */
export const stuckCount = (profileId: number): Promise<number> =>
  db.outbox
    .where({ profileId })
    .filter((event) => event.attempts >= MAX_RETRIES)
    .count();
