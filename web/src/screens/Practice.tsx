import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { type AnswerOutcome, nextQuestion, recordAnswer } from '@/db/practice';
import { db, type LocalQuestion } from '@/db/schema';
import { get } from '@/lib/api';
import { useActiveProfile } from '@/lib/session';

/**
 * Why an empty screen is empty — a distinction the child on the other side of it can act on.
 *
 * `undownloaded` is a network problem and the fix is to open the app once with a connection.
 * `unwritten` is a content gap: the server was reached and it has no questions for this skill,
 * so there is nothing a better signal can retrieve. Collapsing the two into one message blames
 * the network for a missing question bank and sends a student looking for a connection they are
 * already using.
 */
type BankState = 'ready' | 'unwritten' | 'undownloaded';

/**
 * The practice screen — where most of a student's time is spent, and where the tone of the whole
 * product is set.
 *
 * The rules it follows are deliberate and they are not decoration:
 *
 *   No timer. No countdown, no clock, no "you took 12 seconds". Time pressure is the fastest way to
 *   make a child who is already behind stop trying.
 *
 *   No red, and no ✗. A wrong answer is "لسّا" — not yet — on a warm surface, with the working
 *   shown. These are children who have been told they are behind for two years; the app is not
 *   going to be one more thing that marks them.
 *
 *   One question per screen, four options at most, every target over 44px. A mistap on a cracked
 *   digitiser is recorded as a wrong answer the child never gave.
 *
 *   No score visible mid-practice. Mastery is a state, not a running tally to anxiously watch.
 */
export function Practice() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const profile = useActiveProfile();

  const [question, setQuestion] = useState<LocalQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [empty, setEmpty] = useState(false);
  const [bank, setBank] = useState<BankState>('ready');

  const loadBank = useCallback(async (): Promise<BankState> => {
    // Already downloaded? Then this works with the radio off, which is the entire point.
    const held = await db.questions.where({ skill_code: code }).count();
    if (held > 0) return 'ready';

    const response = await get<{
      skill: { code: string; name_ar: string };
      questions: LocalQuestion[];
    }>(`/skills/${code}/bank`);

    if (!response.ok) return 'undownloaded';

    // The server answered, and it has nothing for this skill. Reconnecting will not change that,
    // so telling a child to go and find a signal would send them looking for one they already have.
    if (response.data.questions.length === 0) return 'unwritten';

    await db.questions.bulkPut(
      response.data.questions.map((q) => ({ ...q, skill_code: response.data.skill.code })),
    );

    return 'ready';
  }, [code]);

  const advance = useCallback(async () => {
    if (!profile) return;

    setSelected(null);
    setOutcome(null);
    setShowHint(false);

    const next = await nextQuestion(profile.id, code);
    setQuestion(next);
    setEmpty(next === null);
  }, [profile, code]);

  useEffect(() => {
    if (!profile) return;

    void (async () => {
      const skill = await db.skills.get(code);
      setSkillName(skill?.name_ar ?? code);

      setBank(await loadBank());
      await advance();
    })();
  }, [profile, code, loadBank, advance]);

  const submit = async (optionId: number) => {
    if (!profile || !question || outcome) return;

    setSelected(optionId);
    setOutcome(await recordAnswer(profile.id, question, optionId));
  };

  if (empty) {
    return (
      <Shell title={skillName}>
        <p className="text-muted">
          {bank === 'unwritten'
            ? 'أسئلة هذه المهارة لم تُكتب بعد. تابع بقية مسارك — ما فيه من مهارات يعمل كالمعتاد.'
            : `لا توجد أسئلة محفوظة لهذه المهارة على الجهاز بعد. افتح التطبيق مرة واحدة مع اتصال
               لتنزيلها، وبعدها تعمل بدون إنترنت.`}
        </p>
      </Shell>
    );
  }

  if (!question) {
    return (
      <Shell title={skillName}>
        <p className="text-muted">لحظة…</p>
      </Shell>
    );
  }

  return (
    <Shell title={skillName}>
      <div className="mx-auto w-full max-w-[42rem]">
        <p className="text-lg text-ink">{question.stem_ar}</p>

        {question.expression && (
          <p className="expr mt-3 text-3xl font-semibold text-ink">{question.expression}</p>
        )}

        <div className="mt-6 grid gap-3">
          {question.options.map((option) => {
            const chosen = selected === option.id;
            const revealed = outcome !== null;
            const isAnswer = option.is_correct;

            // After answering: the right answer is always highlighted, even when the student
            // missed it. Being shown the answer is the teaching moment; hiding it to preserve a
            // "wrong" verdict teaches nothing.
            const tone = !revealed
              ? 'border-line-strong bg-raised text-ink hover:border-brand'
              : isAnswer
                ? 'border-mastered bg-mastered text-mastered-ink'
                : chosen
                  ? 'border-retry bg-retry-surface text-retry'
                  : 'border-line bg-surface text-subtle';

            return (
              <button
                key={option.id}
                type="button"
                disabled={revealed}
                onClick={() => void submit(option.id)}
                className={`min-h-[56px] rounded-[var(--radius-md)] border-2 px-5 py-3 text-start text-lg transition-colors ${tone}`}
              >
                <span className="expr">{option.text_ar}</span>
              </button>
            );
          })}
        </div>

        {!outcome && question.hint_ar && (
          <div className="mt-5">
            {showHint ? (
              <p className="rounded-[var(--radius-md)] bg-raised p-4 text-muted">
                {question.hint_ar}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setShowHint(true)}
                className="text-brand underline underline-offset-4"
              >
                أعطني تلميحاً
              </button>
            )}
          </div>
        )}

        {outcome && (
          <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-raised p-5">
            <p className="text-lg font-semibold text-ink">
              {outcome.isCorrect ? 'أحسنت 👏' : 'لسّا — خلّينا نشوفها سوا'}
            </p>

            {outcome.explanation && (
              <p className="mt-2 text-muted">
                <span className="expr">{outcome.explanation}</span>
              </p>
            )}

            {outcome.justMastered && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-mastered px-4 py-3 font-semibold text-mastered-ink">
                أتقنت هذه المهارة. المهارة التالية صارت مفتوحة.
              </p>
            )}

            {outcome.decision.action === 'route_to_prerequisite' && (
              <p className="mt-4 rounded-[var(--radius-md)] bg-retry-surface px-4 py-3 text-retry">
                خلّينا نرجع خطوة للوراء ونبني الأساس أولاً — هذا أسرع طريق للأمام، مش تراجعاً.
              </p>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void advance()}
                className="rounded-[var(--radius-pill)] bg-brand px-6 py-3 font-medium text-brand-ink"
              >
                التالي
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="rounded-[var(--radius-pill)] border border-line-strong px-6 py-3 text-muted"
              >
                توقّف هنا
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-6">
      <h1 className="mb-6 text-xl font-semibold text-ink">{title}</h1>
      {children}
    </section>
  );
}
