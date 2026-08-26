import { useCallback, useEffect, useRef, useState } from 'react';
import { post } from '@/lib/api';
import { decodeFrames, parseFrame, type ScannedFrame } from '@/sync/codec';
import { type Scanner, scanningSupported, startScanner } from '@/sync/scanner';

/**
 * The teacher's side of the paperless, networkless handover.
 *
 * A student holds up their screen and this reads their week off it. The room needs no router, no
 * hotspot and no second application — only two devices that already exist and a camera.
 *
 * The upload happens when the teacher's device next has a connection, not at scan time, so
 * collecting a whole class can happen in a tent and the sending can happen wherever the signal is.
 */
export function TeacherScan({ token }: { token: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<Scanner | null>(null);

  const [frames, setFrames] = useState<ScannedFrame[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const onCode = useCallback((value: string) => {
    const frame = parseFrame(value);

    if (!frame) {
      setError('هذا الرمز ليس من نبض.');
      return;
    }

    setError(null);
    setFrames((current) =>
      current.some((f) => f.index === frame.index) ? current : [...current, frame],
    );
  }, []);

  const begin = async () => {
    setError(null);

    if (!videoRef.current) return;

    try {
      scannerRef.current = await startScanner(videoRef.current, onCode);
      setScanning(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر تشغيل الكاميرا.');
    }
  };

  const stop = useCallback(() => {
    scannerRef.current?.stop();
    scannerRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const upload = async () => {
    setError(null);
    setStatus('جارٍ الإرسال…');

    try {
      const payload = await decodeFrames(frames);

      const response = await post<{ accepted: number; duplicates: number }>(
        '/sync/relay',
        {
          // The DEVICE id travels with the payload, not the scanner's own. The events were
          // recorded on the student's phone and their sequence numbers belong to it; attributing
          // them to the teacher's device would scramble the ordering of both.
          device_id: payload.device_id,
          student_id: payload.student_id,
          channel: 'qr',
          events: payload.events,
        },
        { token },
      );

      if (!response.ok) {
        setStatus(null);
        setError(
          response.offline
            ? 'لا يوجد اتصال الآن. الرموز محفوظة — أرسلها عندما تجد شبكة.'
            : response.message,
        );
        return;
      }

      setStatus(
        `تم: ${response.data.accepted} إجابة جديدة` +
          (response.data.duplicates > 0 ? ` · ${response.data.duplicates} وصلت مسبقاً` : ''),
      );
      setFrames([]);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : 'تعذّر قراءة الرموز.');
    }
  };

  const total = frames[0]?.total ?? 0;
  const complete = total > 0 && frames.length === total;

  if (!scanningSupported()) {
    return (
      <main className="mx-auto w-full max-w-[36rem] px-5 py-10">
        <p className="rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">
          هذا المتصفح لا يدعم مسح الرموز. استخدم كروم على أندرويد.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[36rem] px-5 py-6">
      <h1 className="text-xl font-semibold text-ink">استقبال عمل الطلاب</h1>
      <p className="mt-2 text-muted">وجّه الكاميرا إلى شاشة الطالب. لا حاجة لإنترنت أثناء المسح.</p>

      <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-black">
        {/* Muted and inline so iOS plays it without going fullscreen; this is a viewfinder, not
            media. */}
        <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline>
          <track kind="captions" />
        </video>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        {scanning ? (
          <button
            type="button"
            onClick={stop}
            className="min-h-touch rounded-[var(--radius-pill)] border border-line-strong px-6 text-ink"
          >
            إيقاف الكاميرا
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void begin()}
            className="min-h-touch rounded-[var(--radius-pill)] bg-brand px-6 font-medium text-brand-ink"
          >
            ابدأ المسح
          </button>
        )}

        {complete && (
          <button
            type="button"
            onClick={() => void upload()}
            className="min-h-touch rounded-[var(--radius-pill)] bg-mastered px-6 font-medium text-mastered-ink"
          >
            أرسل للخادم
          </button>
        )}
      </div>

      {total > 0 && (
        <p className="mt-4 text-muted">
          {/* Says how many are still missing rather than accepting a partial batch, because a
              student whose half-week was silently dropped would never know. */}
          <span className="expr">
            {frames.length} / {total}
          </span>{' '}
          {complete ? 'اكتمل المسح' : 'رمزاً — تابع المسح'}
        </p>
      )}

      {status && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-mastered px-4 py-3 text-mastered-ink">
          {status}
        </p>
      )}

      {error && (
        <p className="mt-4 rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">
          {error}
        </p>
      )}

      {!token && (
        <p className="mt-6 text-sm text-subtle">سجّل دخولك كمعلّم أولاً لتتمكّن من الإرسال.</p>
      )}
    </main>
  );
}
