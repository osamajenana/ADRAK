import { describe, expect, it } from 'vitest';

import type { OutboxEvent } from '@/db/schema';
import { decodeBase45, encodeBase45 } from './base45';
import { decodeFrames, encodeForQr, parseFrame } from './codec';

/**
 * The sync channel that needs no infrastructure: a student holds up a screen, a teacher points a
 * camera at it, and a week of work crosses the gap.
 */

function events(count: number): OutboxEvent[] {
  return Array.from({ length: count }, (_, i) => ({
    // Realistic UUIDv7s from one session: consecutive, sharing almost all of their leading bytes,
    // which is exactly the redundancy gzip is here to remove.
    id: `01931f00-${String(i).padStart(4, '0')}-7000-8000-00000000${String(i).padStart(4, '0')}`,
    profileId: 1,
    client_seq: i + 1,
    type: 'exercise_attempt' as const,
    payload: { question_id: 1000 + i, option_id: 5000 + i, is_correct: i % 3 !== 0 },
    client_created_at: 1767225600 + i * 47,
    attempts: 0,
  }));
}

const DEVICE = '01931f00-0000-7000-8000-000000000001';

describe('base45', () => {
  it('round-trips arbitrary bytes', () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);

    expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
  });

  it('round-trips an odd number of bytes', () => {
    const bytes = Uint8Array.from([1, 2, 3]);

    expect(decodeBase45(encodeBase45(bytes))).toEqual(bytes);
  });

  it('produces only characters QR alphanumeric mode accepts', () => {
    const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 256);

    // The exact 45 characters of QR's alphanumeric mode — anything else forces the encoder into
    // byte mode and inflates the symbol by roughly half.
    expect(encodeBase45(bytes)).toMatch(/^[0-9A-Z $%*+\-./:]*$/);
  });

  it('refuses input that is not base45', () => {
    expect(() => decodeBase45('abc')).toThrow();
  });
});

describe('QR sync payload', () => {
  it('fits a normal day of work in a single code', async () => {
    const frames = await encodeForQr(DEVICE, 42, events(30));

    expect(frames).toHaveLength(1);

    // The claim this feature is built on: a day of answers is a few hundred characters, well
    // inside what one scannable symbol holds.
    expect(frames[0].length).toBeLessThan(1300);
  });

  it('round-trips exactly what went in', async () => {
    const original = events(25);
    const frames = await encodeForQr(DEVICE, 42, original);

    const scanned = frames.map(parseFrame).filter((f) => f !== null);
    const decoded = await decodeFrames(scanned);

    expect(decoded.device_id).toBe(DEVICE);
    expect(decoded.student_id).toBe(42);
    expect(decoded.events).toHaveLength(25);
    expect(decoded.events[0].id).toBe(original[0].id);
    expect(decoded.events[24].payload).toEqual(original[24].payload);
  });

  it('splits a fortnight of work across frames and reassembles it', async () => {
    const original = events(400);
    const frames = await encodeForQr(DEVICE, 42, original);

    expect(frames.length).toBeGreaterThan(1);

    const scanned = frames.map(parseFrame).filter((f) => f !== null);
    const decoded = await decodeFrames(scanned);

    expect(decoded.events).toHaveLength(400);
  });

  it('reassembles frames scanned out of order', async () => {
    const frames = await encodeForQr(DEVICE, 42, events(400));

    const shuffled = [...frames]
      .reverse()
      .map(parseFrame)
      .filter((f) => f !== null);
    const decoded = await decodeFrames(shuffled);

    expect(decoded.events).toHaveLength(400);
  });

  /**
   * Refusing a partial batch is the whole point. Silently decoding what arrived would leave a
   * student believing their week had been handed over when half of it had not.
   */
  it('refuses a partial scan and says how much is missing', async () => {
    const frames = await encodeForQr(DEVICE, 42, events(400));
    const scanned = frames.map(parseFrame).filter((f) => f !== null);

    await expect(decodeFrames(scanned.slice(0, 1))).rejects.toThrow(/ينقص/);
  });

  it('ignores a QR code that is not ours', () => {
    expect(parseFrame('https://example.com')).toBeNull();
    expect(parseFrame('')).toBeNull();
    // A future version prefix must not be misread as this one.
    expect(parseFrame('NABD2:1/1:ABC')).toBeNull();
  });

  it("compresses the redundancy out of a session's event ids", async () => {
    const many = events(100);
    const raw = JSON.stringify(many).length;
    const frames = await encodeForQr(DEVICE, 42, many);
    const encoded = frames.reduce((n, f) => n + f.length, 0);

    // Consecutive UUIDv7s from one session share nearly all their bytes. Without compression this
    // would not fit on a screen at all.
    expect(encoded).toBeLessThan(raw / 2);
  });
});
