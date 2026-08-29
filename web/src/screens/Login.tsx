import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { deviceId, setActiveProfile } from '@/db/meta';
import { get } from '@/lib/api';
import { login, loginAsDemoStudent, useProfiles } from '@/lib/session';

interface RosterStudent {
  id: number;
  display_name: string;
}

/**
 * Getting in.
 *
 * Three paths, in the order a real classroom uses them:
 *
 *   1. A profile already on this phone — one tap, no network, no typing. After the first day this
 *      is how essentially every session starts.
 *   2. A class code, then your name off the list, then four digits. Reading your own name off a
 *      roster is easier than spelling it, and children do not spell their names the same way twice.
 *   3. A printed QR card, for a device that has never seen this student.
 *
 * There is no email and no password anywhere, because there is no email and no password.
 */
export function Login() {
  const navigate = useNavigate();
  const profiles = useProfiles();

  const [joinCode, setJoinCode] = useState('');
  const [roster, setRoster] = useState<RosterStudent[] | null>(null);
  const [chosen, setChosen] = useState<RosterStudent | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setError(null), []);

  const lookUpClass = async () => {
    setBusy(true);
    setError(null);

    const response = await get<{ students: RosterStudent[] }>(
      `/auth/classrooms/${joinCode.trim().toUpperCase()}`,
    );

    setBusy(false);

    if (!response.ok) {
      setError(
        response.offline
          ? 'لا يوجد اتصال. إذا سبق أن دخلت من هذا الجهاز، اختر اسمك من الأعلى.'
          : 'لم نجد صفاً بهذا الرمز.',
      );
      return;
    }

    setRoster(response.data.students);
  };

  const signIn = async () => {
    if (!chosen) return;

    setBusy(true);
    setError(null);

    const result = await login(
      { join_code: joinCode.trim().toUpperCase(), student_id: chosen.id, pin },
      await deviceId(),
    );

    setBusy(false);

    if (!result.ok) {
      setError(result.message);
      return;
    }

    navigate('/');
  };

  const tryDemo = async () => {
    setBusy(true);
    setError(null);

    const result = await loginAsDemoStudent();

    setBusy(false);

    if (result.ok) navigate('/');
    else setError(result.message);
  };

  const resume = async (id: number) => {
    await setActiveProfile(id);
    navigate('/');
  };

  return (
    <main className="mx-auto w-full max-w-[32rem] px-5 py-10">
      <h1 className="text-2xl font-semibold text-ink">أدرك</h1>
      <p className="mt-1 text-muted">تعلّم من حيث أنت، لا من حيث يفترض بك أن تكون.</p>

      {/* First on the page on purpose. Anyone evaluating this who does not find a way in
          within five seconds simply does not see the product. */}
      <div className="mt-6 grid gap-2 rounded-[var(--radius-lg)] border border-line bg-raised p-4">
        <p className="text-sm text-subtle">للتجربة السريعة — بدون تسجيل</p>
        <button
          type="button"
          data-testid="demo-student"
          disabled={busy}
          onClick={() => void tryDemo()}
          className="min-h-touch rounded-[var(--radius-pill)] bg-brand px-6 py-3 font-medium text-brand-ink disabled:opacity-50"
        >
          جرّب كطالب
        </button>
        <a
          href="/teacher"
          className="tap grid place-content-center rounded-[var(--radius-pill)] border border-line-strong px-6 py-3 text-center text-muted"
        >
          جرّب كمعلّم
        </a>
      </div>

      {profiles && profiles.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm text-subtle">من على هذا الجهاز</h2>
          <div className="grid gap-2">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                onClick={() => void resume(profile.id)}
                className="flex min-h-[56px] items-center justify-between rounded-[var(--radius-md)] border border-line-strong bg-raised px-5 text-lg text-ink hover:border-brand"
              >
                <span>{profile.display_name}</span>
                <span className="text-sm text-subtle">صف {profile.grade}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm text-subtle">طالب جديد على هذا الجهاز</h2>

        {roster === null ? (
          <div className="grid gap-3">
            <label className="text-muted" htmlFor="join-code">
              رمز الصف
            </label>
            <input
              id="join-code"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              // The code is read aloud across a room; the alphabet it is drawn from excludes every
              // glyph a ten-year-old confuses.
              maxLength={6}
              autoCapitalize="characters"
              autoComplete="off"
              className="expr min-h-touch rounded-[var(--radius-md)] border-2 border-line-strong bg-surface px-4 py-3 text-2xl tracking-[0.3em] text-ink"
            />
            <button
              type="button"
              disabled={joinCode.length < 6 || busy}
              onClick={() => void lookUpClass()}
              className="min-h-touch rounded-[var(--radius-pill)] bg-brand px-6 py-3 font-medium text-brand-ink disabled:opacity-50"
            >
              متابعة
            </button>
          </div>
        ) : chosen === null ? (
          <div className="grid gap-2">
            <p className="text-muted">اختر اسمك</p>
            {roster.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => setChosen(student)}
                className="min-h-[56px] rounded-[var(--radius-md)] border border-line-strong bg-raised px-5 text-start text-lg text-ink hover:border-brand"
              >
                {student.display_name}
              </button>
            ))}
          </div>
        ) : (
          <div className="grid gap-3">
            <p className="text-muted">أهلاً {chosen.display_name} — اكتب رقمك السري</p>
            <input
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              maxLength={4}
              className="expr min-h-touch rounded-[var(--radius-md)] border-2 border-line-strong bg-surface px-4 py-3 text-center text-3xl tracking-[0.5em] text-ink"
            />
            <button
              type="button"
              disabled={pin.length < 4 || busy}
              onClick={() => void signIn()}
              className="min-h-touch rounded-[var(--radius-pill)] bg-brand px-6 py-3 font-medium text-brand-ink disabled:opacity-50"
            >
              ادخل
            </button>
            <button
              type="button"
              onClick={() => {
                setChosen(null);
                setPin('');
              }}
              className="text-muted underline underline-offset-4"
            >
              اسم آخر
            </button>
          </div>
        )}
      </section>

      {error && (
        <p className="mt-5 rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">
          {error}
        </p>
      )}
    </main>
  );
}
