import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { SkillMap } from '@/components/SkillMap';
import { db } from '@/db/schema';
import { get } from '@/lib/api';
import { type BootstrapPayload, hydrate, useActiveProfile, useSkillMapData } from '@/lib/session';

/**
 * Home: what to do next, and how far they have come.
 *
 * The next step comes first and the map comes second, on purpose. A child opening this app should
 * see one thing they can finish today — not fifty-eight nodes and a sense of how far behind they
 * are. The map is there to be looked at when they want to, not to greet them with the scale of it.
 */
export function Home() {
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const data = useSkillMapData(profile?.id);
  const pending = useLiveQuery(
    () => (profile ? db.outbox.where({ profileId: profile.id }).count() : Promise.resolve(0)),
    [profile?.id],
    0,
  );
  const [refreshed, setRefreshed] = useState(false);

  useEffect(() => {
    if (!profile || refreshed) return;

    // Best effort. If there is no signal, everything below still renders from IndexedDB — which is
    // the whole reason the bootstrap payload was stored in the first place.
    void (async () => {
      const response = await get<BootstrapPayload>('/student/bootstrap');
      if (response.ok) await hydrate(response.data);
      setRefreshed(true);
    })();
  }, [profile, refreshed]);

  if (!profile) return null;

  const current = data?.path.find((item) => item.status === 'current');
  const done = data?.path.filter((item) => item.status === 'done').length ?? 0;
  const total = data?.path.length ?? 0;
  const mastered = Object.values(data?.statuses ?? {}).filter((s) => s === 'mastered').length;

  return (
    <main className="mx-auto w-full max-w-[56rem] px-5 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">أهلاً {profile.display_name}</h1>
        <p className="mt-1 text-muted">
          {mastered > 0 ? `أتقنت ${mastered} مهارة حتى الآن.` : 'خلّينا نبدأ من حيث أنت بالضبط.'}
        </p>
      </header>

      {current ? (
        <section className="rounded-[var(--radius-lg)] border-2 border-brand bg-raised p-6">
          <p className="text-sm text-subtle">مهارتك الحالية</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">{current.name_ar}</h2>

          {total > 0 && (
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-locked">
                <div
                  className="h-full bg-brand transition-[width]"
                  style={{ width: `${Math.round((done / total) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-subtle">
                {done} من {total} خطوة في مسارك
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate(`/practice/${current.skill_code}`)}
            className="mt-6 min-h-touch w-full rounded-[var(--radius-pill)] bg-brand px-6 py-3 text-lg font-medium text-brand-ink"
          >
            ابدأ
          </button>
        </section>
      ) : (
        <section className="rounded-[var(--radius-lg)] border border-line bg-raised p-6">
          <h2 className="text-xl font-semibold text-ink">لنكتشف مستواك أولاً</h2>
          <p className="mt-2 text-muted">
            أسئلة قليلة فقط — لا امتحان ولا درجة. الهدف أن نعرف من أين نبدأ معك بالضبط.
          </p>
          <button
            type="button"
            onClick={() => navigate('/diagnostic')}
            className="mt-6 min-h-touch w-full rounded-[var(--radius-pill)] bg-brand px-6 py-3 text-lg font-medium text-brand-ink"
          >
            لنبدأ
          </button>
        </section>
      )}

      {(pending ?? 0) > 0 && (
        <section className="mt-6 rounded-[var(--radius-lg)] border border-line bg-raised p-5">
          <p className="text-ink">
            <span className="expr font-semibold">{pending}</span> إجابة لم تصل للخادم بعد.
          </p>
          <p className="mt-1 text-sm text-subtle">
            لا يوجد إنترنت؟ اعرض رمزاً لمعلّمك ليمسحه — تصل بدون شبكة إطلاقاً.
          </p>
          <button
            type="button"
            onClick={() => navigate('/hand-over')}
            className="mt-4 min-h-touch rounded-[var(--radius-pill)] border border-brand px-6 text-brand"
          >
            سلّم عملك لمعلّمك
          </button>
        </section>
      )}

      {data && data.path.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">خطوات مسارك</h2>

          {/*
           * Real buttons in an ordinary list, deliberately. This is the navigation, and the map
           * beside it is only a picture — a native button cannot exist inside SVG, and a `<g>`
           * wearing role="button" is second-class for a screen reader or a switch. Whoever is
           * driving this screen, they drive it from here.
           */}
          <ol className="grid gap-2">
            {data.path.map((item, index) => {
              const locked = item.status === 'locked';
              const done = item.status === 'done';

              return (
                <li key={item.skill_code}>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => navigate(`/practice/${item.skill_code}`)}
                    className={`flex min-h-[56px] w-full items-center gap-3 rounded-[var(--radius-md)] border px-5 py-3 text-start ${
                      done
                        ? 'border-line bg-surface text-subtle'
                        : locked
                          ? 'cursor-not-allowed border-line bg-surface text-subtle'
                          : 'border-brand bg-raised text-ink'
                    }`}
                  >
                    <span aria-hidden="true" className="expr text-sm text-subtle">
                      {index + 1}
                    </span>
                    <span className="flex-1">{item.name_ar}</span>
                    <span className="text-sm">
                      {done ? 'أتقنتها ✓' : locked ? 'مقفلة' : 'ابدأ'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {data && data.skills.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">خريطة مهاراتك</h2>
          <SkillMap
            skills={data.skills}
            statuses={data.statuses}
            pathCodes={data.pathCodes}
            currentCode={data.currentCode}
          />
          <p className="mt-3 text-sm text-subtle">
            الدائرة المضيئة هي مهارتك الحالية. الخط النابض هو طريقك إليها.
          </p>
        </section>
      )}
    </main>
  );
}
