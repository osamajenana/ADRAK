import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { get, post } from '@/lib/api';
import { type BootstrapPayload, hydrate } from '@/lib/session';

interface ApiQuestion {
  id: number;
  skill_code: string;
  stem_ar: string;
  expression: string | null;
  options: Array<{ id: number; text_ar: string }>;
}

interface AnswerResponse {
  is_correct: boolean;
  finished: boolean;
  asked?: number;
  question: ApiQuestion | null;
  result?: { estimated_level: number; mastered: string[]; weak: string[]; missing: string[] };
}

/**
 * The diagnostic.
 *
 * Fifteen questions at most, and usually around nine, to find where a student actually is. It is
 * framed to them as the opposite of a test — no score is shown, no timer runs, and nothing here
 * says right or wrong. Being told "wrong" nine times in a row is how a placement test convinces a
 * child they are stupid; this one simply moves on, because every answer is equally useful to it.
 *
 * This is the ONE flow that needs a connection. The walk decides each probe from the answers so
 * far, and running it locally would mean shipping the whole question bank to a device that has not
 * yet earned a reason to hold it. Everything after this works offline.
 */
export function Diagnostic() {
  const navigate = useNavigate();

  const [question, setQuestion] = useState<ApiQuestion | null>(null);
  const [asked, setAsked] = useState(0);
  const [maxQuestions, setMaxQuestions] = useState(15);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AnswerResponse['result'] | null>(null);

  const start = useCallback(async () => {
    setBusy(true);

    const response = await post<{
      question: ApiQuestion | null;
      asked: number;
      max_questions: number;
      finished: boolean;
    }>('/diagnostic/start');

    setBusy(false);

    if (!response.ok) {
      setError(
        response.offline
          ? 'اختبار تحديد المستوى يحتاج اتصالاً لمرة واحدة. بعده كل شيء يعمل بدون إنترنت.'
          : response.message,
      );
      return;
    }

    setQuestion(response.data.question);
    setAsked(response.data.asked ?? 0);
    setMaxQuestions(response.data.max_questions ?? 15);
  }, []);

  useEffect(() => {
    void start();
  }, [start]);

  const answer = async (optionId: number) => {
    if (!question || busy) return;

    setBusy(true);

    const response = await post<AnswerResponse>('/diagnostic/answer', {
      question_id: question.id,
      option_id: optionId,
    });

    setBusy(false);

    if (!response.ok) {
      setError(response.offline ? 'انقطع الاتصال. أعد المحاولة لاحقاً.' : response.message);
      return;
    }

    if (response.data.finished) {
      setQuestion(null);
      setOutcome(response.data.result ?? null);

      // The path is already waiting on the server; pull it before the student reaches home.
      const bootstrap = await get<BootstrapPayload>('/student/bootstrap');
      if (bootstrap.ok) await hydrate(bootstrap.data);

      return;
    }

    setQuestion(response.data.question);
    setAsked(response.data.asked ?? asked + 1);
  };

  if (error) {
    return (
      <main className="mx-auto w-full max-w-[42rem] px-5 py-10">
        <p className="rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">{error}</p>
      </main>
    );
  }

  if (outcome) {
    return (
      <main className="mx-auto w-full max-w-[42rem] px-5 py-10">
        <h1 className="text-2xl font-semibold text-ink">عرفنا من أين نبدأ</h1>

        <p className="mt-4 text-lg text-muted">
          أتقنت <span className="expr font-semibold text-mastered">{outcome.mastered.length}</span>{' '}
          مهارة من أساسياتك. وضعنا لك مساراً يبدأ من أول فجوة حقيقية — لا من أول الكتاب.
        </p>

        <p className="mt-3 text-muted">
          لا يوجد شيء هنا اسمه رسوب. هذه نقطة انطلاق، ونحن نعرفها الآن بدقة.
        </p>

        <button
          type="button"
          onClick={() => navigate('/')}
          className="mt-8 min-h-touch w-full rounded-[var(--radius-pill)] bg-brand px-6 py-3 text-lg font-medium text-brand-ink"
        >
          اعرض مساري
        </button>
      </main>
    );
  }

  if (!question) {
    return (
      <main className="mx-auto w-full max-w-[42rem] px-5 py-10">
        <p className="text-muted">لحظة…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[42rem] px-5 py-6">
      {/* Progress, never a score. How far through, not how well — this screen deliberately never
          tells a child whether they got one right. */}
      <div className="mb-6">
        <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-locked">
          <div
            className="h-full bg-brand transition-[width]"
            style={{ width: `${Math.min(100, Math.round((asked / maxQuestions) * 100))}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-subtle">نتعرّف على مستواك — لا درجة ولا وقت</p>
      </div>

      <p className="text-lg text-ink">{question.stem_ar}</p>

      {question.expression && (
        <p className="expr mt-3 text-3xl font-semibold text-ink">{question.expression}</p>
      )}

      <div className="mt-6 grid gap-3">
        {question.options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={busy}
            onClick={() => void answer(option.id)}
            className="min-h-[56px] rounded-[var(--radius-md)] border-2 border-line-strong bg-raised px-5 py-3 text-start text-lg text-ink transition-colors hover:border-brand disabled:opacity-60"
          >
            <span className="expr">{option.text_ar}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={busy}
        onClick={() => void answer(-1)}
        className="mt-5 text-muted underline underline-offset-4"
      >
        لا أعرف هذه — تخطّاها
      </button>
    </main>
  );
}
