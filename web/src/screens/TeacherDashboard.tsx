import { useEffect, useState } from 'react';
import { get } from '@/lib/api';

/**
 * What a teacher sees before the next lesson.
 *
 * Ordered by what they can act on soonest, not by what is easiest to compute. The named errors come
 * first because each one is a twenty-minute explanation that fixes several children at once; the
 * roster comes last because a list of names is the least actionable thing here.
 *
 * Nothing on this screen is a chart. A teacher with sixty students, two hours of electricity and a
 * class waiting does not need to interpret anything — they need to know who to sit together and
 * what to say.
 */

interface Overview {
  classroom: { id: number; name: string; join_code: string; grade: number };
  students: Array<{
    id: number;
    display_name: string;
    mastered: number;
    learning: number;
    last_seen_at: string | null;
  }>;
  groups: Array<{
    skill_code: string;
    name_ar: string;
    students: Array<{ id: number; display_name: string; mastery_score: number }>;
  }>;
  misconceptions: Array<{
    id: number;
    name_ar: string;
    remediation_ar: string;
    skill_name_ar: string;
    student_count: number;
    occurrences: number;
    students: Array<{ id: number; display_name: string }>;
  }>;
  interventions: Array<{
    student_id: number;
    display_name: string;
    skill_name_ar: string;
    attempts: number;
    mastery_score: number;
  }>;
}

export function TeacherDashboard({ token }: { token: string }) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const classes = await get<{ classrooms: Array<{ id: number }> }>(
        '/teacher/classrooms',
        token,
      );

      if (!classes.ok) {
        setError(classes.offline ? 'لا يوجد اتصال.' : classes.message);
        return;
      }

      const first = classes.data.classrooms[0];
      if (!first) {
        setError('لا توجد صفوف مرتبطة بحسابك بعد.');
        return;
      }

      const overview = await get<Overview>(`/teacher/classrooms/${first.id}`, token);

      if (overview.ok) setData(overview.data);
      else setError(overview.offline ? 'لا يوجد اتصال.' : overview.message);
    })();
  }, [token]);

  if (error) {
    return <p className="mx-auto max-w-[48rem] px-5 py-6 text-retry">{error}</p>;
  }

  if (!data) {
    return <p className="mx-auto max-w-[48rem] px-5 py-6 text-muted">لحظة…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-[48rem] px-5 py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-ink">{data.classroom.name}</h1>
        <p className="mt-1 text-muted">
          {data.students.length} طالباً · رمز الصف{' '}
          <span className="expr font-semibold text-ink">{data.classroom.join_code}</span>
        </p>
      </header>

      {/* ⭐ First, because each entry is a lesson a teacher can give this afternoon. */}
      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink">أخطاء مشتركة</h2>
        <p className="mb-4 text-sm text-subtle">
          ليست «طلاب رسبوا في الكسور» — بل الخطأ المحدد الذي يرتكبونه، ومَن هم، وماذا تقول لهم.
        </p>

        {data.misconceptions.length === 0 ? (
          <Empty>لا يوجد خطأ يتكرّر بين طالبين أو أكثر بعد.</Empty>
        ) : (
          <div className="grid gap-4">
            {data.misconceptions.map((entry) => (
              <article
                key={entry.id}
                className="rounded-[var(--radius-lg)] border-2 border-learning bg-raised p-5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-lg font-semibold text-ink">{entry.name_ar}</h3>
                  <span className="rounded-[var(--radius-pill)] bg-learning px-3 py-1 text-sm font-semibold text-learning-ink">
                    <span className="expr">{entry.student_count}</span> طلاب ·{' '}
                    <span className="expr">{entry.occurrences}</span> مرة
                  </span>
                </div>

                <p className="mt-1 text-sm text-subtle">في: {entry.skill_name_ar}</p>

                <p className="mt-3 text-muted">{entry.remediation_ar}</p>

                <ul className="mt-4 flex flex-wrap gap-2">
                  {entry.students.map((student) => (
                    <li
                      key={student.id}
                      className="rounded-[var(--radius-pill)] bg-surface px-3 py-1 text-sm text-ink"
                    >
                      {student.display_name}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink">مجموعات العمل</h2>
        <p className="mb-4 text-sm text-subtle">
          طلاب متوقّفون عند نفس المهارة — حصة واحدة تكفيهم جميعاً.
        </p>

        {data.groups.length === 0 ? (
          <Empty>لا توجد مجموعات متوقّفة الآن.</Empty>
        ) : (
          <div className="grid gap-3">
            {data.groups.map((group) => (
              <article
                key={group.skill_code}
                className="rounded-[var(--radius-md)] border border-line bg-raised p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="font-semibold text-ink">{group.name_ar}</h3>
                  <span className="expr text-sm text-muted">{group.students.length}</span>
                </div>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {group.students.map((student) => (
                    <li key={student.id} className="text-sm text-muted">
                      {student.display_name}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold text-ink">يحتاجون وقتك</h2>
        <p className="mb-4 text-sm text-subtle">
          حاولوا كثيراً ولم يتقدّموا. المزيد من نفس التمارين لن يفيدهم.
        </p>

        {data.interventions.length === 0 ? (
          <Empty>لا أحد متعثّر بهذا الشكل الآن.</Empty>
        ) : (
          <ul className="grid gap-2">
            {data.interventions.map((entry) => (
              <li
                key={`${entry.student_id}-${entry.skill_name_ar}`}
                className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-md)] border border-retry bg-retry-surface px-4 py-3"
              >
                <span className="font-medium text-ink">{entry.display_name}</span>
                <span className="text-sm text-retry">
                  {entry.skill_name_ar} · <span className="expr">{entry.attempts}</span> محاولة ·{' '}
                  <span className="expr">{Math.round(entry.mastery_score)}%</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-ink">الطلاب</h2>
        <ul className="grid gap-2">
          {data.students.map((student) => (
            <li
              key={student.id}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3"
            >
              <span className="text-ink">{student.display_name}</span>
              <span className="text-sm text-muted">
                <span className="expr text-mastered">{student.mastered}</span> متقنة ·{' '}
                <span className="expr">{student.learning}</span> قيد التعلّم
                {student.last_seen_at === null && ' · لم يبدأ بعد'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-md)] border border-line bg-surface px-4 py-3 text-subtle">
      {children}
    </p>
  );
}
