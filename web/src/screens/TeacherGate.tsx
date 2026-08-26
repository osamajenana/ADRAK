import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db } from '@/db/schema';
import { post, setTeacherToken } from '@/lib/api';
import { TeacherDashboard } from './TeacherDashboard';
import { TeacherScan } from './TeacherScan';

/**
 * Staff sign-in, kept deliberately separate from the student session.
 *
 * A teacher collecting a class often does it on a phone one of their students was holding a minute
 * earlier, so signing in as staff must not displace that child's profile or their unsent work. The
 * two tokens live side by side in the local database.
 */
export function TeacherGate() {
  const token = useLiveQuery(
    async () => ((await db.meta.get('teacher_token'))?.value as string | undefined) ?? null,
    [],
  );

  const [view, setView] = useState<'dashboard' | 'scan'>('dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (token === undefined) return null;

  if (token) {
    return (
      <>
        <nav className="mx-auto flex w-full max-w-[48rem] gap-2 px-5 pt-6">
          <Tab active={view === 'dashboard'} onClick={() => setView('dashboard')}>
            لوحة الصف
          </Tab>
          <Tab active={view === 'scan'} onClick={() => setView('scan')}>
            استقبال بالمسح
          </Tab>
        </nav>

        {view === 'dashboard' ? <TeacherDashboard token={token} /> : <TeacherScan token={token} />}

        <div className="mx-auto w-full max-w-[48rem] px-5 pb-8">
          <button
            type="button"
            onClick={() => void setTeacherToken(null)}
            className="text-muted underline underline-offset-4"
          >
            تسجيل خروج المعلّم
          </button>
        </div>
      </>
    );
  }

  const signIn = async () => {
    setBusy(true);
    setError(null);

    const response = await post<{ token: string; user: { role: string } }>(
      '/auth/teacher',
      { email, password },
      { auth: false },
    );

    setBusy(false);

    if (!response.ok) {
      setError(
        response.offline
          ? 'دخول المعلّم يحتاج اتصالاً لمرة واحدة.'
          : (Object.values(response.errors ?? {})[0]?.[0] ?? response.message),
      );
      return;
    }

    await setTeacherToken(response.data.token);
  };

  return (
    <main className="mx-auto w-full max-w-[28rem] px-5 py-10">
      <h1 className="text-xl font-semibold text-ink">دخول المعلّم</h1>
      <p className="mt-2 text-muted">لاستقبال عمل الطلاب بالمسح الضوئي.</p>

      <div className="mt-6 grid gap-3">
        <label className="text-muted" htmlFor="teacher-email">
          البريد الإلكتروني
        </label>
        <input
          id="teacher-email"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-touch rounded-[var(--radius-md)] border-2 border-line-strong bg-surface px-4 py-3 text-ink"
        />

        <label className="text-muted" htmlFor="teacher-password">
          كلمة المرور
        </label>
        <input
          id="teacher-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-touch rounded-[var(--radius-md)] border-2 border-line-strong bg-surface px-4 py-3 text-ink"
        />

        <button
          type="button"
          disabled={busy || email === '' || password === ''}
          onClick={() => void signIn()}
          className="min-h-touch rounded-[var(--radius-pill)] bg-brand px-6 py-3 font-medium text-brand-ink disabled:opacity-50"
        >
          ادخل
        </button>
      </div>

      {error && (
        <p className="mt-5 rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">
          {error}
        </p>
      )}
    </main>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`min-h-touch rounded-[var(--radius-pill)] px-5 text-sm font-medium ${
        active ? 'bg-brand text-brand-ink' : 'border border-line-strong text-muted'
      }`}
    >
      {children}
    </button>
  );
}
