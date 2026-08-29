import type { OutboxEvent } from '@/db/schema';
import { decodeBase45, encodeBase45 } from './base45';

/**
 * Packing a student's offline work into something that fits on a screen.
 *
 * This is the sync channel that needs no infrastructure at all: no router, no hotspot, no pairing,
 * no certificate, no second app. A student holds up their phone, their teacher points a camera at
 * it, and a week of work crosses the gap. In a tent with no signal and no equipment, that is the
 * only channel that actually exists.
 *
 * The direct alternative — the student's PWA posting to a teacher's device over the local network —
 * is not merely harder, it is prohibited: the app is served over HTTPS, and a request to
 * http://192.168.x.x is blocked as mixed content. Serving the app over HTTP on the LAN instead
 * would drop the secure context and take the service worker with it, so the offline capability
 * would be traded away to build an offline feature.
 *
 * Shape: JSON → gzip → Base45 → QR. Compression matters more than it looks: consecutive UUIDv7s
 * from one session share almost all of their leading bytes, and gzip removes nearly all of that.
 */

/** Version prefix, so a newer student app and an older teacher app fail loudly instead of quietly. */
const MAGIC = 'ADRAK1';

/** Conservative for a cracked screen in bad light — well inside alphanumeric capacity at 4296. */
const MAX_CHARS_PER_FRAME = 1200;

export interface SyncPayload {
  device_id: string;
  student_id: number;
  events: Array<{
    id: string;
    client_seq: number;
    type: string;
    payload: unknown;
    client_created_at: number;
  }>;
}

async function gzip(text: string): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Typed as ArrayBuffer-backed because Blob will not take a SharedArrayBuffer-backed view, and
// TypeScript 5.7 made that distinction visible in the type.
async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));

  return new Response(stream).text();
}

/**
 * Encodes a batch into one or more QR frame strings.
 *
 * Multi-frame is a fallback, not the expectation: a normal day of work is one code. A student who
 * has been offline for a fortnight gets two or three, shown in sequence.
 */
export async function encodeForQr(
  deviceId: string,
  studentId: number,
  events: OutboxEvent[],
): Promise<string[]> {
  const payload: SyncPayload = {
    device_id: deviceId,
    student_id: studentId,
    events: events.map((event) => ({
      id: event.id,
      client_seq: event.client_seq,
      type: event.type,
      payload: event.payload,
      client_created_at: event.client_created_at,
    })),
  };

  const body = encodeBase45(await gzip(JSON.stringify(payload)));

  const chunks: string[] = [];
  for (let i = 0; i < body.length; i += MAX_CHARS_PER_FRAME) {
    chunks.push(body.slice(i, i + MAX_CHARS_PER_FRAME));
  }

  // Each frame carries its own index and the total, so they can be scanned in any order and the
  // scanner can say how many are still missing rather than silently accepting a partial batch.
  return chunks.map((chunk, index) => `${MAGIC}:${index + 1}/${chunks.length}:${chunk}`);
}

export interface ScannedFrame {
  index: number;
  total: number;
  body: string;
}

/** Parses one scanned frame. Returns null for anything that is not one of ours. */
export function parseFrame(text: string): ScannedFrame | null {
  const match = /^ADRAK1:(\d+)\/(\d+):(.*)$/s.exec(text.trim());

  if (!match) return null;

  return { index: Number(match[1]), total: Number(match[2]), body: match[3] };
}

/**
 * Reassembles frames into a payload.
 *
 * Throws when frames are missing rather than decoding what arrived. A partially scanned batch that
 * silently succeeded would leave a student believing their week had been handed over.
 */
export async function decodeFrames(frames: ScannedFrame[]): Promise<SyncPayload> {
  if (frames.length === 0) throw new Error('لم يتم مسح أي رمز.');

  const total = frames[0].total;
  const byIndex = new Map(frames.map((frame) => [frame.index, frame]));

  const missing: number[] = [];
  for (let i = 1; i <= total; i++) {
    if (!byIndex.has(i)) missing.push(i);
  }

  if (missing.length > 0) {
    throw new Error(`ينقص ${missing.length} من ${total} — امسح الرموز المتبقية.`);
  }

  const body = Array.from({ length: total }, (_, i) => byIndex.get(i + 1)?.body ?? '').join('');

  return JSON.parse(await gunzip(decodeBase45(body))) as SyncPayload;
}
