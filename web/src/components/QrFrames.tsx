import { useEffect, useState } from 'react';

/**
 * Renders sync frames as QR codes for a teacher to scan off the screen.
 *
 * The generator is imported dynamically. It is 11 KB gzipped and this screen is opened rarely, so
 * it has no business in the bundle a phone downloads on 2G before showing a student anything.
 *
 * The SVG is built here from the module matrix rather than taken as markup from the library. Same
 * output, but it goes through React as elements instead of through dangerouslySetInnerHTML — there
 * is no reason to open that door for a picture we can draw ourselves in ten lines.
 *
 * Error correction is M rather than L. These are cracked screens in bad light held by an unsteady
 * hand; the extra redundancy buys a scan that works first time, and a retry in a room of thirty
 * children costs far more than the bytes do.
 */

const MARGIN = 2;

interface Code {
  size: number;
  /** One path covering every dark module — one DOM node instead of several thousand rects. */
  path: string;
}

export function QrFrames({ frames }: { frames: string[] }) {
  const [current, setCurrent] = useState(0);
  const [code, setCode] = useState<Code | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { default: qrcode } = await import('qrcode-generator');

        const qr = qrcode(0, 'M');
        // Alphanumeric mode is the whole reason the payload is Base45: it stores this data at
        // about two-thirds the size of byte mode, keeping the symbol small enough to scan.
        qr.addData(frames[current], 'Alphanumeric');
        qr.make();

        const count = qr.getModuleCount();
        let path = '';

        for (let row = 0; row < count; row++) {
          for (let col = 0; col < count; col++) {
            if (qr.isDark(row, col)) {
              path += `M${col + MARGIN},${row + MARGIN}h1v1h-1z`;
            }
          }
        }

        if (!cancelled) {
          setCode({ size: count + MARGIN * 2, path });
          setError(null);
        }
      } catch {
        if (!cancelled) setError('تعذّر إنشاء الرمز على هذا الجهاز.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [frames, current]);

  if (error) {
    return (
      <p className="rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">{error}</p>
    );
  }

  return (
    <div className="grid justify-items-center gap-4">
      {/* White regardless of theme. A scanner expects the contrast the QR spec assumes, and
          inverting a code is the fastest way to make it unreadable. */}
      <div className="w-full max-w-[22rem] rounded-[var(--radius-lg)] bg-white p-4">
        {code ? (
          <svg
            viewBox={`0 0 ${code.size} ${code.size}`}
            className="h-auto w-full"
            // shape-rendering keeps module edges hard at any scale; anti-aliased edges are what
            // make a code fail on a low-resolution camera.
            shapeRendering="crispEdges"
            role="img"
            aria-label={`رمز المزامنة ${current + 1} من ${frames.length}`}
          >
            <title>{`رمز المزامنة ${current + 1} من ${frames.length}`}</title>
            <rect width={code.size} height={code.size} fill="#ffffff" />
            <path d={code.path} fill="#000000" />
          </svg>
        ) : (
          <div className="aspect-square animate-pulse rounded bg-slate-200" />
        )}
      </div>

      {frames.length > 1 && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={current === 0}
            onClick={() => setCurrent((i) => Math.max(0, i - 1))}
            className="min-h-touch rounded-[var(--radius-pill)] border border-line-strong px-5 text-ink disabled:opacity-40"
          >
            السابق
          </button>

          <span className="expr text-muted">
            {current + 1} / {frames.length}
          </span>

          <button
            type="button"
            disabled={current === frames.length - 1}
            onClick={() => setCurrent((i) => Math.min(frames.length - 1, i + 1))}
            className="min-h-touch rounded-[var(--radius-pill)] border border-line-strong px-5 text-ink disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      )}
    </div>
  );
}
