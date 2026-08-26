import { db } from './schema';

/**
 * Small key/value corners of the local database: the device identity and the sequence counter that
 * orders everything a student does offline.
 */

const DEVICE_ID = 'device_id';
const CLIENT_SEQ = 'client_seq';
const ACTIVE_PROFILE = 'active_profile';
const LAST_SYNC_AT = 'last_sync_at';

async function get<T>(key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

const set = (key: string, value: unknown): Promise<string> => db.meta.put({ key, value });

/**
 * A UUIDv7 minted once and kept forever on this device.
 *
 * The server records it rather than issuing it, because a phone that has been working offline for a
 * week already stamped that week's attempts with it. An id handed out at login would arrive too
 * late to order the work that happened before the login.
 */
export async function deviceId(): Promise<string> {
  const existing = await get<string>(DEVICE_ID);
  if (existing) return existing;

  const minted = uuidv7();
  await set(DEVICE_ID, minted);

  return minted;
}

/**
 * The next per-device sequence number.
 *
 * Monotonic and never reused. It is what puts a student's answers back in order after they arrive
 * at the server out of order, twice, and days late — which is the normal case here, not the edge
 * case. A wall clock cannot do this job: these devices lose power for days and come back with the
 * date at 1970 or 2099.
 */
export async function nextClientSeq(): Promise<number> {
  return db.transaction('rw', db.meta, async () => {
    const current = (await get<number>(CLIENT_SEQ)) ?? 0;
    const next = current + 1;
    await set(CLIENT_SEQ, next);

    return next;
  });
}

export const activeProfileId = (): Promise<number | undefined> => get<number>(ACTIVE_PROFILE);

export const setActiveProfile = (id: number): Promise<string> => set(ACTIVE_PROFILE, id);

export const clearActiveProfile = (): Promise<void> => db.meta.delete(ACTIVE_PROFILE);

export const lastSyncAt = (): Promise<number | undefined> => get<number>(LAST_SYNC_AT);

export const markSynced = (at: number): Promise<string> => set(LAST_SYNC_AT, at);

/**
 * UUIDv7: 48 bits of millisecond timestamp, then randomness.
 *
 * Written out rather than pulled in as a dependency — it is fifteen lines, and every package is a
 * real download on the connection this app is built for. Time-ordered ids keep the server's
 * primary-key index append-friendly instead of scattering writes the way v4 would.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 4122 variant

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
