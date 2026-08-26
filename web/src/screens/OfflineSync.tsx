import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { QrFrames } from '@/components/QrFrames';
import { deviceId } from '@/db/meta';
import { db } from '@/db/schema';
import { useActiveProfile } from '@/lib/session';
import { encodeForQr } from '@/sync/codec';

/**
 * Handing a week of work to a teacher with no network anywhere in the room.
 *
 * A student holds up their screen, the teacher points a camera at it, and the work crosses. No
 * router, no hotspot, no pairing, no cable, no second app — nothing that has to exist in a tent.
 *
 * The obvious alternative, the student's app posting to the teacher's device over the local
 * network, is not merely harder: it is prohibited. The app is served over HTTPS and a request to
 * http://192.168.x.x is blocked as mixed content, while serving it over HTTP on the LAN would drop
 * the secure context and take the service worker with it — trading the offline capability away in
 * order to build an offline feature.
 */
export function OfflineSync() {
  const navigate = useNavigate();
  const profile = useActiveProfile();

  const [frames, setFrames] = useState<string[] | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!profile) return;

    void (async () => {
      const queued = await db.outbox.where({ profileId: profile.id }).sortBy('client_seq');
      setCount(queued.length);

      if (queued.length === 0) {
        setFrames([]);
        return;
      }

      setFrames(await encodeForQr(await deviceId(), profile.id, queued));
    })();
  }, [profile]);

  if (!profile || frames === null) {
    return (
      <main className="px-5 py-10">
        <p className="text-muted">لحظة…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[36rem] px-5 py-6">
      <h1 className="text-xl font-semibold text-ink">سلّم عملك لمعلّمك</h1>

      {count === 0 ? (
        <p className="mt-4 rounded-[var(--radius-md)] bg-raised px-4 py-3 text-muted">
          لا يوجد عمل بانتظار التسليم — كل شيء وصل بالفعل.
        </p>
      ) : (
        <>
          <p className="mt-2 text-muted">
            <span className="expr font-semibold text-ink">{count}</span> إجابة بانتظار المزامنة.
            اعرض الرمز لمعلّمك ليمسحه — لا حاجة لإنترنت.
          </p>

          <div className="mt-6">
            <QrFrames frames={frames} />
          </div>

          <p className="mt-6 text-sm text-subtle">
            عملك يبقى محفوظاً على جهازك بعد المسح. لن تفقد شيئاً حتى لو لم يعمل المسح من أول مرة.
          </p>
        </>
      )}

      <button
        type="button"
        onClick={() => navigate('/')}
        className="mt-8 min-h-touch w-full rounded-[var(--radius-pill)] border border-line-strong px-6 py-3 text-muted"
      >
        رجوع
      </button>
    </main>
  );
}
