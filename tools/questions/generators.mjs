/**
 * Per-skill question generators.
 *
 * Every generator is `(rng, difficulty) => question`. Numbers are drawn from the seeded PRNG and
 * constrained so the skill is actually exercised — an "addition with regrouping" item that happens
 * to need no regrouping teaches and measures nothing, so the generators loop until they get one.
 *
 * Distractors come from tools/questions/lib.mjs `Misconception`, which executes the error rather
 * than guessing at it. Tags are cross-checked against content/skill-graph.json by the runner.
 */
import {
  int, pick, mcq, frac, fracText, addFrac, mulFrac, divFrac, gcd, lcm, decText, Misconception,
} from './lib.mjs';

const S = (x) => String(x);

/** An algebraic coefficient: 1 is implied and never written, so 1x renders as x. */
const coef = (n) => (n === 1 ? '' : String(n));

/** Distinct digits 1-9, so "the digit 7" in a place-value stem names exactly one position. */
function distinctDigits(r, n) {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const out = [];
  for (let i = 0; i < n; i++) out.push(...pool.splice(Math.floor(r() * pool.length), 1));

  return out;
}

const SUPERSCRIPT = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];

/** Renders an exponent as a superscript, the way a textbook prints it. */
const sup = (n) => String(n).split('').map((c) => SUPERSCRIPT[Number(c)] ?? c).join('');

/** Digit ranges per difficulty: [addend A, addend B]. B is shorter so misalignment is a real risk. */
const ADD_RANGES = {
  easy: [[12, 89], [13, 89]],
  medium: [[125, 899], [14, 89]],
  hard: [[1250, 8999], [125, 899]],
};

export const generators = {
  /* ------------------------------------------------------------ operations */

  'OPS.ADD': (r, d) => {
    const [[aLo, aHi], [bLo, bHi]] = ADD_RANGES[d];
    let a, b;
    do {
      a = int(r, aLo, aHi);
      b = int(r, bLo, bHi);
    } while ((a % 10) + (b % 10) < 10); // force a carry out of the ones column
    const correct = a + b;

    return mcq(r, {
      skill: 'OPS.ADD', difficulty: d,
      stem: 'احسب ناتج الجمع:',
      expression: `${a} + ${b}`,
      correct: S(correct),
      distractors: [
        { text: S(Misconception.addWithoutCarry(a, b)), tag: 'add.no_carry' },
        { text: S(a + b * 10), tag: 'add.misaligned' },
      ],
      hint: 'ابدأ من منزلة الآحاد. إذا تجاوز ناتج المنزلة 9، احمل واحداً إلى المنزلة التي على يسارها.',
      explanation: `الآحاد أولاً مع الحمل، ثم العشرات: الناتج ${correct}.`,
    });
  },

  'OPS.SUB': (r, d) => {
    let a, b;
    if (d === 'hard') {
      // borrowing across a zero — the case that separates procedure from understanding
      a = int(r, 2, 8) * 100;
      b = int(r, 111, 289);
    } else {
      const [lo, hi] = d === 'easy' ? [22, 98] : [212, 898];
      do {
        a = int(r, lo, hi);
        b = int(r, Math.floor(lo / 2), a - 1);
      } while (a % 10 >= b % 10); // force a borrow
    }
    const correct = a - b;

    return mcq(r, {
      skill: 'OPS.SUB', difficulty: d,
      stem: 'احسب ناتج الطرح:',
      expression: `${a} − ${b}`,
      correct: S(correct),
      distractors: [
        { text: S(Misconception.subtractSmallerDigit(a, b)), tag: 'sub.smaller_from_larger' },
        d === 'hard' ? { text: S(correct - 100), tag: 'sub.zero_borrow' } : null,
      ].filter(Boolean),
      hint: 'إذا كان الرقم في الأعلى أصغر، استلف واحداً من المنزلة التي على يساره — لا تعكس الطرح.',
      explanation: `${a} − ${b} = ${correct}. الاستلاف يغيّر منزلتين معاً: الأعلى ينقص واحداً والأدنى يزيد عشرة.`,
    });
  },

  'OPS.MUL.FACTS': (r, d) => {
    const [aLo, aHi] = d === 'easy' ? [2, 5] : d === 'medium' ? [6, 9] : [7, 12];
    const a = int(r, aLo, aHi);
    const b = int(r, d === 'hard' ? 6 : 2, d === 'hard' ? 12 : 9);
    const correct = a * b;

    return mcq(r, {
      skill: 'OPS.MUL.FACTS', difficulty: d,
      stem: 'كم يساوي:',
      expression: `${a} × ${b}`,
      correct: S(correct),
      distractors: [
        { text: S(a + b), tag: 'mul.confuse_add' },
        { text: S(a * (b - 1)), tag: 'mul.repeated_add_error' },
      ],
      hint: `${a} × ${b} تعني ${a} مجموعات في كل منها ${b}.`,
      explanation: `${a} × ${b} = ${correct}.`,
    });
  },

  'OPS.MUL.MULTI': (r, d) => {
    const a = d === 'easy' ? int(r, 13, 89) : d === 'medium' ? int(r, 13, 89) : int(r, 112, 899);
    const b = d === 'easy' ? int(r, 3, 9) : int(r, 12, 89);
    const correct = a * b;

    // The tens partial product must be shifted one place; forgetting that is `mul.no_placeholder`.
    const noShift = b >= 10 ? a * (b % 10) + a * Math.floor(b / 10) : null;

    return mcq(r, {
      skill: 'OPS.MUL.MULTI', difficulty: d,
      stem: 'احسب ناتج الضرب:',
      expression: `${a} × ${b}`,
      correct: S(correct),
      distractors: [
        noShift ? { text: S(noShift), tag: 'mul.no_placeholder' } : null,
        { text: S(a * b - a), tag: 'mul.partial_add' },
      ].filter(Boolean),
      hint: 'عند ضرب رقم العشرات، الناتج يُزاح منزلة واحدة لأنك تضرب في مضاعف للعشرة.',
      explanation: `${a} × ${b} = ${correct}.`,
    });
  },

  'OPS.DIV.BASIC': (r, d) => {
    const b = d === 'easy' ? int(r, 2, 5) : d === 'medium' ? int(r, 4, 9) : int(r, 6, 12);
    const q = d === 'easy' ? int(r, 3, 9) : d === 'medium' ? int(r, 6, 19) : int(r, 12, 40);
    const a = b * q;

    return mcq(r, {
      skill: 'OPS.DIV.BASIC', difficulty: d,
      stem: 'احسب ناتج القسمة:',
      expression: `${a} ÷ ${b}`,
      correct: S(q),
      distractors: [
        { text: (b / a).toFixed(2), tag: 'div.commutative' },
        { text: S(a * b), tag: 'div.commutative' },
      ],
      hint: `اسأل نفسك: كم مرة يدخل ${b} في ${a}؟`,
      explanation: `${b} × ${q} = ${a}، إذن ${a} ÷ ${b} = ${q}.`,
    });
  },

  'OPS.DIV.LONG': (r, d) => {
    const b = d === 'easy' ? int(r, 3, 6) : d === 'medium' ? int(r, 6, 9) : int(r, 12, 24);
    const q = d === 'easy' ? int(r, 4, 12) : d === 'medium' ? int(r, 11, 40) : int(r, 15, 60);
    const rem = int(r, 1, b - 1); // non-zero: the remainder is the whole point of this skill
    const a = b * q + rem;

    return mcq(r, {
      skill: 'OPS.DIV.LONG', difficulty: d,
      stem: 'احسب ناتج القسمة والباقي:',
      expression: `${a} ÷ ${b}`,
      correct: `${q} والباقي ${rem}`,
      distractors: [
        { text: S(q), tag: 'div.ignore_remainder' },
        { text: `${q + 1} والباقي ${rem}`, tag: 'div.drop_digit' },
        // Untagged on purpose: this skill catalogues only two misconceptions, and inventing a
        // third tag to fill a slot would put noise into the teacher's analytics.
        { text: `${q} والباقي ${rem === b - 1 ? rem - 1 : rem + 1}`, tag: null },
      ],
      hint: 'اقسم، اضرب، اطرح، أنزِل — وكرّر. ما يتبقّى في النهاية وهو أصغر من المقسوم عليه هو الباقي.',
      explanation: `${b} × ${q} = ${b * q}، و ${a} − ${b * q} = ${rem}. إذن الناتج ${q} والباقي ${rem}.`,
    });
  },

  /* ------------------------------------------------------------- fractions */

  'FRC.EQUIV': (r, d) => {
    const n = int(r, 1, 4);
    const den = int(r, n + 1, d === 'easy' ? 6 : 9);
    const k = d === 'easy' ? int(r, 2, 3) : d === 'medium' ? int(r, 3, 5) : int(r, 4, 8);
    const base = frac(n, den);

    return mcq(r, {
      skill: 'FRC.EQUIV', difficulty: d,
      stem: `أيّ الكسور التالية يكافئ الكسر ${fracText(base)} ؟`,
      expression: null,
      correct: `${n * k}/${den * k}`,
      distractors: [
        { text: fracText(frac(n + k, den + k)), tag: 'frc.add_instead_multiply' },
        { text: fracText(frac(n * k, den)), tag: 'frc.partial_reduce' },
      ],
      hint: 'الكسر المتكافئ ينتج عن ضرب البسط والمقام في العدد نفسه — لا عن جمع عدد لهما.',
      explanation: `اضرب البسط والمقام في ${k}: ${n}×${k}=${n * k} و ${den}×${k}=${den * k}.`,
    });
  },

  'FRC.ADD.LIKE': (r, d) => {
    const den = d === 'easy' ? int(r, 4, 8) : int(r, 7, 12);
    const a = int(r, 1, den - 2);
    const b = int(r, 1, den - a - 1);
    const sum = addFrac(frac(a, den), frac(b, den));

    return mcq(r, {
      skill: 'FRC.ADD.LIKE', difficulty: d,
      stem: 'احسب ناتج الجمع في أبسط صورة:',
      expression: `${a}/${den} + ${b}/${den}`,
      correct: fracText(sum),
      distractors: [
        {
          text: fracText(Misconception.addLikeDenominators(frac(a, den), frac(b, den))),
          tag: 'frc.add_denominators_like',
        },
      ],
      hint: 'المقام هو حجم القطعة — وهو لا يتغيّر عند الجمع. اجمع البسوط فقط.',
      explanation: `${a}/${den} + ${b}/${den} = ${a + b}/${den} = ${fracText(sum)}.`,
    });
  },

  /** The flagship item: `frc.add_across` is the single most common error in school mathematics. */
  'FRC.ADD.UNLIKE': (r, d) => {
    const pairs = { easy: [[2, 3], [2, 4], [3, 6]], medium: [[3, 4], [4, 6], [3, 5]], hard: [[4, 9], [6, 8], [5, 7]] };
    const [d1, d2] = pick(r, pairs[d]);
    const a = frac(int(r, 1, d1 - 1), d1);
    const b = frac(int(r, 1, d2 - 1), d2);
    const sum = addFrac(a, b);

    return mcq(r, {
      skill: 'FRC.ADD.UNLIKE', difficulty: d,
      stem: 'احسب ناتج الجمع في أبسط صورة:',
      expression: `${fracText(a)} + ${fracText(b)}`,
      correct: fracText(sum),
      distractors: [
        { text: fracText(Misconception.addAcross(a, b)), tag: 'frc.add_across' },
        { text: fracText(Misconception.convertOnlyFirst(a, b)), tag: 'frc.lcm_only_one' },
      ],
      hint: `وحّد المقامين أولاً. المضاعف المشترك الأصغر لـ ${d1} و ${d2} هو ${lcm(d1, d2)}.`,
      explanation: `بتوحيد المقام على ${lcm(d1, d2)} يصبح الجمع ممكناً، والناتج ${fracText(sum)}. جمع البسط مع البسط والمقام مع المقام يعطي إجابة خاطئة دائماً.`,
    });
  },

  'FRC.MUL': (r, d) => {
    const a = frac(int(r, 1, 4), int(r, 2, d === 'easy' ? 5 : 9));
    const b = frac(int(r, 1, 4), int(r, 2, d === 'easy' ? 5 : 9));
    const product = mulFrac(a, b);

    return mcq(r, {
      skill: 'FRC.MUL', difficulty: d,
      stem: 'احسب ناتج الضرب في أبسط صورة:',
      expression: `${fracText(a)} × ${fracText(b)}`,
      correct: fracText(product),
      distractors: [
        {
          text: fracText(Misconception.commonDenomBeforeMultiply(a, b)),
          tag: 'frc.mul_needs_common_denom',
        },
        { text: fracText(addFrac(a, b)), tag: 'mul.always_bigger' },
      ],
      hint: 'الضرب لا يحتاج توحيد مقامات: اضرب البسط في البسط والمقام في المقام.',
      explanation: `${fracText(a)} × ${fracText(b)} = ${fracText(product)} — وهو أصغر من الكسرين، لأن الضرب في كسر أقل من واحد يُصغّر.`,
    });
  },

  'FRC.DIV': (r, d) => {
    const a = frac(int(r, 1, 5), int(r, 2, d === 'easy' ? 4 : 8));
    const b = frac(int(r, 1, 4), int(r, 2, d === 'easy' ? 4 : 8));
    const quotient = divFrac(a, b);

    return mcq(r, {
      skill: 'FRC.DIV', difficulty: d,
      stem: 'احسب ناتج القسمة في أبسط صورة:',
      expression: `${fracText(a)} ÷ ${fracText(b)}`,
      correct: fracText(quotient),
      distractors: [
        { text: fracText(Misconception.flipFirstFraction(a, b)), tag: 'frc.div_flip_wrong' },
        { text: fracText(mulFrac(a, b)), tag: 'div.always_smaller_frc' },
      ],
      hint: 'اقلب المقسوم عليه — الكسر الثاني — ثم اضرب.',
      explanation: `${fracText(a)} ÷ ${fracText(b)} = ${fracText(a)} × ${fracText(frac(b.d, b.n))} = ${fracText(quotient)}.`,
    });
  },

  /* -------------------------------------------------------------- integers */

  'NUM.INT.ADDSUB': (r, d) => {
    const magnitude = d === 'easy' ? [2, 9] : d === 'medium' ? [6, 25] : [15, 80];
    const a = -int(r, ...magnitude);
    const b = -int(r, ...magnitude);
    const subtracting = d !== 'easy' && r() < 0.5;

    if (subtracting) {
      const correct = a - b; // minus a negative is a plus
      return mcq(r, {
        skill: 'NUM.INT.ADDSUB', difficulty: d,
        stem: 'احسب:',
        expression: `${a} − (${b})`,
        correct: S(correct),
        distractors: [
          { text: S(Misconception.subtractInsteadOfAdd(a, b)), tag: 'int.sub_always_smaller' },
          { text: S(a + b), tag: 'int.double_negative' },
        ],
        hint: 'طرح عدد سالب يكافئ جمع نظيره الموجب — ناقص ناقص تساوي زائد.',
        explanation: `${a} − (${b}) = ${a} + ${-b} = ${correct}.`,
      });
    }

    const correct = a + b;
    return mcq(r, {
      skill: 'NUM.INT.ADDSUB', difficulty: d,
      stem: 'احسب:',
      expression: `(${a}) + (${b})`,
      correct: S(correct),
      distractors: [
        { text: S(Misconception.ignoreSigns(a, b)), tag: 'int.ignore_signs' },
        { text: S(Math.abs(a) - Math.abs(b)), tag: 'int.ignore_signs' },
      ],
      hint: 'كلا العددين سالب، فأنت تتحرّك يساراً على خط الأعداد مرتين.',
      explanation: `${a} + ${b} = ${correct} — سالب زائد سالب يبقى سالباً ويزداد بُعداً عن الصفر.`,
    });
  },

  'NUM.ORDER.OPS': (r, d) => {
    const num = (x) => (Number.isInteger(x) ? S(x) : x.toFixed(2).replace(/\.?0+$/, ''));
    const a = int(r, 2, 9);
    const b = int(r, 2, 9);
    const c = int(r, 2, 9);

    if (d !== 'hard') {
      const expression = d === 'easy' ? `${a} + ${b} × ${c}` : `${a} + ${b} × ${c} − ${b}`;
      const correct = d === 'easy' ? a + b * c : a + b * c - b;
      const leftToRight = d === 'easy' ? (a + b) * c : (a + b) * c - b;

      return mcq(r, {
        skill: 'NUM.ORDER.OPS', difficulty: d,
        stem: 'احسب مع مراعاة ترتيب العمليات:',
        expression,
        correct: S(correct),
        distractors: [{ text: S(leftToRight), tag: 'ord.left_to_right' }],
        hint: 'الأقواس أولاً، ثم الأسس، ثم الضرب والقسمة، ثم الجمع والطرح.',
        explanation: `الضرب يُنفّذ قبل الجمع، فالناتج ${correct}.`,
      });
    }

    // Division before multiplication at the same precedence level — the only shape where
    // `ord.mul_before_div` produces a genuinely different answer. Parentheses would not: a student
    // who works strictly left-to-right still honours them, so the distractor would collapse onto
    // the correct answer and be dropped, leaving the item with no misconception signal at all.
    const q = int(r, 2, 5);
    const m = int(r, 2, 6);
    const p = q * m; // keeps the division exact
    const s = int(r, 2, 5);

    const correct = a + (p / q) * s;
    return mcq(r, {
      skill: 'NUM.ORDER.OPS', difficulty: d,
      stem: 'احسب مع مراعاة ترتيب العمليات:',
      expression: `${a} + ${p} ÷ ${q} × ${s}`,
      correct: S(correct),
      distractors: [
        { text: num(a + p / (q * s)), tag: 'ord.mul_before_div' },
        { text: num(((a + p) / q) * s), tag: 'ord.left_to_right' },
      ],
      hint: 'الضرب والقسمة في المرتبة نفسها، وتُنفَّذان من اليسار إلى اليمين — لا الضرب أولاً.',
      explanation: `${p} ÷ ${q} = ${p / q} أولاً، ثم × ${s} = ${(p / q) * s}، ثم + ${a} = ${correct}.`,
    });
  },

  /* ----------------------------------------------------------------- ratio */

  'RAT.PERCENT': (r, d) => {
    const pct = pick(r, d === 'easy' ? [10, 25, 50] : d === 'medium' ? [15, 20, 30, 40] : [12, 35, 45, 65]);
    const whole = d === 'easy' ? int(r, 4, 20) * 10 : int(r, 8, 40) * 10;
    const correct = (pct / 100) * whole;

    return mcq(r, {
      skill: 'RAT.PERCENT', difficulty: d,
      stem: `كم يساوي ${pct}% من ${whole} ؟`,
      expression: null,
      correct: Number.isInteger(correct) ? S(correct) : correct.toFixed(1),
      distractors: [
        { text: S(Misconception.percentAsMultiplier(pct, whole)), tag: 'pct.multiply_by_number' },
        { text: (whole / pct).toFixed(1), tag: 'pct.find_whole' },
      ],
      hint: `حوّل ${pct}% إلى ${(pct / 100).toString()} ثم اضرب في ${whole}.`,
      explanation: `${pct}% من ${whole} = ${pct / 100} × ${whole} = ${correct}.`,
    });
  },

  /* --------------------------------------------------------------- algebra */

  'ALG.SIMPLIFY': (r, d) => {
    const c1 = int(r, 2, 9);
    const k = int(r, 2, 9);
    if (d === 'easy') {
      const c2 = int(r, 2, 9);
      return mcq(r, {
        skill: 'ALG.SIMPLIFY', difficulty: d,
        stem: 'بسّط العبارة:',
        expression: `${c1}س + ${c2}س`,
        correct: `${c1 + c2}س`,
        distractors: [
          { text: `${c1 + c2}س²`, tag: 'alg.combine_unlike' },
          { text: `${c1 * c2}س`, tag: 'alg.combine_unlike' },
          { text: `${c1 + c2}`, tag: null },
        ],
        hint: 'الحدود المتشابهة تحمل المتغير نفسه بالأس نفسه — اجمع معاملاتها فقط.',
        explanation: `${c1}س + ${c2}س = ${c1 + c2}س.`,
      });
    }

    if (d === 'medium') {
      return mcq(r, {
        skill: 'ALG.SIMPLIFY', difficulty: d,
        stem: 'بسّط العبارة:',
        expression: `${c1}س + ${k}`,
        correct: `${c1}س + ${k}`,
        distractors: [
          { text: `${Misconception.combineUnlikeTerms(c1, k)}س`, tag: 'alg.combine_unlike' },
          { text: S(c1 + k), tag: 'alg.combine_unlike' },
          { text: `${c1 * k}س`, tag: 'alg.combine_unlike' },
        ],
        hint: `${c1}س و ${k} حدّان غير متشابهين — أحدهما فيه متغير والآخر عدد ثابت.`,
        explanation: `لا يمكن جمع ${c1}س مع ${k}. العبارة مبسّطة كما هي.`,
      });
    }

    const c2 = int(r, 2, 9);
    return mcq(r, {
      skill: 'ALG.SIMPLIFY', difficulty: d,
      stem: 'بسّط العبارة:',
      expression: `${k}(س + ${c1}) − ${c2}`,
      correct: `${k}س + ${k * c1 - c2}`,
      distractors: [
        { text: `${k}س + ${c1} − ${c2}`, tag: 'alg.distribute_partial' },
        { text: `${k}س − ${k * c1 - c2}`, tag: 'alg.negative_distribute' },
        { text: `${k + c1}س − ${c2}`, tag: 'alg.combine_unlike' },
      ],
      hint: 'وزّع الضرب على كل حدود القوس، لا على الحد الأول وحده.',
      explanation: `${k}(س + ${c1}) = ${k}س + ${k * c1}، ثم بطرح ${c2} تصبح ${k}س + ${k * c1 - c2}.`,
    });
  },

  'ALG.EQ.ONESTEP': (r, d) => {
    const x = int(r, 2, d === 'easy' ? 12 : 25);
    const k = int(r, 2, d === 'easy' ? 9 : 20);
    const adding = r() < 0.5;
    const rhs = adding ? x + k : x - k;

    return mcq(r, {
      skill: 'ALG.EQ.ONESTEP', difficulty: d,
      stem: 'أوجد قيمة س:',
      expression: adding ? `س + ${k} = ${rhs}` : `س − ${k} = ${rhs}`,
      correct: S(x),
      distractors: [
        { text: S(adding ? rhs + k : rhs - k), tag: 'eq.wrong_inverse' },
        { text: S(rhs), tag: 'eq.one_side_only' },
      ],
      hint: adding ? `اطرح ${k} من طرفَي المعادلة.` : `أضف ${k} إلى طرفَي المعادلة.`,
      explanation: `س = ${rhs} ${adding ? '−' : '+'} ${k} = ${x}. ما تفعله بطرف افعله بالآخر.`,
    });
  },

  'ALG.EQ.TWOSTEP': (r, d) => {
    const x = int(r, 2, d === 'hard' ? 20 : 12);
    const a = int(r, 2, d === 'easy' ? 5 : 9);
    const b = int(r, 1, d === 'easy' ? 9 : 25);
    const rhs = a * x + b;

    return mcq(r, {
      skill: 'ALG.EQ.TWOSTEP', difficulty: d,
      stem: 'أوجد قيمة س:',
      expression: `${a}س + ${b} = ${rhs}`,
      correct: S(x),
      distractors: [
        { text: ((rhs / a - b)).toFixed(2).replace(/\.00$/, ''), tag: 'eq.wrong_order' },
        { text: S(rhs - b), tag: 'eq.wrong_inverse' }, // subtracted b, forgot to divide by a
      ],
      hint: `اطرح ${b} من الطرفين أولاً، ثم اقسم على ${a}. نفكّ العمليات بعكس ترتيبها.`,
      explanation: `${a}س = ${rhs} − ${b} = ${a * x}، ثم س = ${a * x} ÷ ${a} = ${x}.`,
    });
  },

  /* ----------------------------------------------------------- place value */

  /**
   * Only `pv.digit_vs_value` is exercised. `pv.longer_is_bigger` cannot be produced honestly for
   * whole numbers — a longer whole number IS the larger one, so any item built to punish that
   * belief would have to be wrong itself. It is exercised where it actually bites, in DEC.PV.
   */
  'NUM.PV': (r, d) => {
    const width = d === 'easy' ? 4 : d === 'medium' ? 6 : 7;
    const digits = distinctDigits(r, width);
    const pos = int(r, 0, width - 2); // never the ones place: value must differ from the digit
    const digit = digits[pos];
    const place = 10 ** (width - 1 - pos);
    const number = Number(digits.join(''));

    return mcq(r, {
      skill: 'NUM.PV', difficulty: d,
      stem: `ما القيمة المنزلية للرقم ${digit} في العدد الآتي؟`,
      expression: S(number),
      correct: S(digit * place),
      distractors: [
        { text: S(digit), tag: 'pv.digit_vs_value' },
        { text: S(place), tag: 'pv.digit_vs_value' },
        { text: S(digit * place * 10), tag: null },
      ],
      hint: 'قيمة الرقم ليست الرقم نفسه: اضربه في قيمة المنزلة التي يقف فيها.',
      explanation: `الرقم ${digit} يقف في منزلة قيمتها ${place}، فقيمته ${digit} × ${place} = ${digit * place}.`,
    });
  },

  /* -------------------------------------------------- factors and multiples */

  'NUM.FACTORS': (r, d) => {
    if (d === 'easy') {
      const a = int(r, 2, 9);
      const b = int(r, 3, 9);
      const n = a * b;
      let notFactor = a + 1;
      while (n % notFactor === 0) notFactor++;

      return mcq(r, {
        skill: 'NUM.FACTORS', difficulty: d,
        stem: `أيّ الأعداد الآتية عامل للعدد ${n}؟`,
        expression: null,
        correct: S(a),
        distractors: [
          { text: S(n * 2), tag: 'num.factor_vs_multiple' },
          { text: S(n * 3), tag: 'num.factor_vs_multiple' },
          { text: S(notFactor), tag: null },
        ],
        hint: `العامل يقسم العدد بلا باقٍ فيكون أصغر منه، والمضاعف ناتج ضربه فيكون أكبر.`,
        explanation: `${a} × ${b} = ${n}، إذن ${a} عامل للعدد ${n}. أمّا ${n * 2} فهو مضاعف له لا عامل.`,
      });
    }

    if (d === 'medium') {
      const p = pick(r, [2, 3, 5, 7]);
      const n = p * pick(r, [7, 11, 13, 17, 19, 23]);

      return mcq(r, {
        skill: 'NUM.FACTORS', difficulty: d,
        stem: `ما أصغر عدد أوّلي يقسم العدد ${n}؟`,
        expression: null,
        correct: S(p),
        distractors: [
          { text: '1', tag: 'num.one_is_prime' },
          { text: S(n), tag: 'num.factor_vs_multiple' },
          { text: S(n * 2), tag: 'num.factor_vs_multiple' },
        ],
        hint: 'العدد الأوّلي له عاملان فقط: 1 ونفسه. والعدد 1 ليس أوّلياً لأن له عاملاً واحداً.',
        explanation: `${n} ÷ ${p} = ${n / p} بلا باقٍ، و ${p} أوّلي. أمّا 1 فليس عدداً أوّلياً.`,
      });
    }

    const primes = [pick(r, [2, 3, 5]), pick(r, [2, 3, 5, 7]), pick(r, [3, 5, 7, 11])].sort((x, y) => x - y);
    const n = primes.reduce((acc, p) => acc * p, 1);
    const asProduct = primes.join(' × ');

    return mcq(r, {
      skill: 'NUM.FACTORS', difficulty: d,
      stem: 'حلّل العدد الآتي إلى عوامله الأوّلية:',
      expression: S(n),
      correct: asProduct,
      distractors: [
        { text: `1 × ${asProduct}`, tag: 'num.one_is_prime' },
        { text: `${primes[0] * primes[1]} × ${primes[2]}`, tag: null },
        { text: `${n} × ${n}`, tag: 'num.factor_vs_multiple' },
      ],
      hint: 'اقسم على أصغر عدد أوّلي ممكن، وكرّر على الناتج حتى يصير أوّلياً.',
      explanation: `${asProduct} = ${n}، وكل عامل هنا أوّلي. العدد 1 لا يُكتب في التحليل لأنه ليس أوّلياً.`,
    });
  },

  'NUM.GCF.LCM': (r, d) => {
    const g = d === 'easy' ? int(r, 2, 5) : int(r, 3, 9);
    let m1 = int(r, 2, 7);
    let m2 = int(r, 2, 9);
    while (gcd(m1, m2) !== 1 || m1 === m2) m2 = m2 === 9 ? 2 : m2 + 1;
    const a = g * m1;
    const b = g * m2;
    const L = lcm(a, b);
    const askingGcf = d !== 'hard';

    return mcq(r, {
      skill: 'NUM.GCF.LCM', difficulty: d,
      stem: askingGcf
        ? `ما القاسم المشترك الأكبر (ق.م.أ) للعددين ${a} و ${b}؟`
        : `ما المضاعف المشترك الأصغر (م.م.أ) للعددين ${a} و ${b}؟`,
      expression: null,
      correct: S(askingGcf ? g : L),
      distractors: [
        { text: S(askingGcf ? L : g), tag: 'num.swap_gcf_lcm' },
        { text: S(a * b), tag: 'num.swap_gcf_lcm' },
        { text: S(a + b), tag: null },
      ],
      hint: 'ق.م.أ يقسم العددين فهو أصغر منهما أو يساوي أصغرهما. م.م.أ من مضاعفاتهما فهو أكبر منهما أو يساوي أكبرهما.',
      explanation: `ق.م.أ(${a}, ${b}) = ${g} و م.م.أ(${a}, ${b}) = ${L}.`,
    });
  },

  /* ---------------------------------------------------- fractions, part two */

  'FRC.CONCEPT': (r, d) => {
    if (d === 'hard') {
      // Unit fractions: the bigger the denominator, the SMALLER the piece. Both numbers sit in the
      // stem so every drawn item carries its own fingerprint.
      const small = int(r, 2, 4);
      const large = small + int(r, 2, 6);

      return mcq(r, {
        skill: 'FRC.CONCEPT', difficulty: d,
        stem: `تُقسَّم كعكة بالتساوي على عدد من الأطفال. أيّ الحصّتين أكبر: حين يكون عددهم ${small}، أم حين يكون ${large}؟`,
        expression: `1/${small}   ,   1/${large}`,
        correct: `1/${small}`,
        distractors: [
          { text: `1/${large}`, tag: 'frc.bigger_denominator_bigger' },
          { text: `1/${small + large}`, tag: 'frc.bigger_denominator_bigger' },
          { text: 'الحصّتان متساويتان', tag: null },
        ],
        hint: 'كلّما زاد عدد الأجزاء صغُر كل جزء — المقام يعدّ الأجزاء ولا يقيس حجمها.',
        explanation: `العدد ${small} يعطي حصّة أكبر، لأن الكعكة نفسها تُوزَّع على عدد أقل من الأطفال.`,
      });
    }

    const parts = d === 'easy' ? int(r, 3, 8) : int(r, 5, 12);
    const shaded = int(r, 1, parts - 1);

    return mcq(r, {
      skill: 'FRC.CONCEPT', difficulty: d,
      stem: `قُسّم شريط إلى أجزاء متساوية عددها ${parts}، ولُوّن منها ${shaded}. ما الكسر الذي يمثّل الجزء الملوّن؟`,
      expression: null,
      correct: `${shaded}/${parts}`,
      distractors: [
        // Counting the dividing marks instead of the pieces — the same slip that produces unequal parts.
        { text: `${shaded}/${parts + 1}`, tag: 'frc.unequal_parts' },
        { text: `${shaded}/${parts - shaded}`, tag: 'frc.unequal_parts' },
        { text: `${parts}/${shaded}`, tag: null },
      ],
      hint: 'المقام هو عدد الأجزاء المتساوية كلّها، والبسط هو عدد ما أخذتَ منها.',
      explanation: `الأجزاء ${parts} والملوّن منها ${shaded}، فالكسر ${shaded}/${parts}.`,
    });
  },

  'FRC.COMPARE': (r, d) => {
    const e = int(r, d === 'easy' ? 3 : 5, d === 'easy' ? 5 : 9);
    const c = e - int(r, 1, 2);
    const b = int(r, e + 4, e + 12);
    const a = int(r, c + 1, Math.max(c + 1, Math.ceil((b * c) / e) - 1));

    // Compute first, label second. Deciding which fraction is larger by construction would put a
    // wrong answer into the bank the moment a draw fell outside the range the construction assumed.
    const left = frac(a, b);
    const right = frac(c, e);
    const leftBigger = a * e > c * b;
    const larger = leftBigger ? left : right;
    const smaller = leftBigger ? right : left;

    return mcq(r, {
      skill: 'FRC.COMPARE', difficulty: d,
      stem: 'أيّ الكسرين أكبر؟',
      expression: `${a}/${b}   ,   ${c}/${e}`,
      correct: `${larger.n}/${larger.d}`,
      distractors: [
        {
          text: `${smaller.n}/${smaller.d}`,
          // Tagged only when the wrong choice is the one a numerator-only comparison would pick.
          tag: smaller.n > larger.n ? 'frc.compare_numerators_only' : null,
        },
        { text: 'لا يمكن المقارنة', tag: null },
        { text: 'الكسران متساويان', tag: null },
      ],
      hint: 'وحّد المقامين أو اضرب تبادلياً. البسط الأكبر لا يعني كسراً أكبر ما دام المقام مختلفاً.',
      explanation: `${a} × ${e} = ${a * e} و ${c} × ${b} = ${c * b}، إذن ${larger.n}/${larger.d} أكبر.`,
    });
  },

  'FRC.MIXED': (r, d) => {
    const w = int(r, 2, d === 'easy' ? 4 : 9);
    const den = int(r, 3, d === 'easy' ? 6 : 12);
    const num = int(r, 1, den - 1);
    const improper = w * den + num;

    return mcq(r, {
      skill: 'FRC.MIXED', difficulty: d,
      stem: 'حوّل العدد الكسري الآتي إلى كسر غير فعلي:',
      expression: `${w} ${num}/${den}`,
      // Written unreduced on purpose: an improper fraction that has been reduced no longer shows
      // the conversion the question is asking about.
      correct: `${improper}/${den}`,
      distractors: [
        { text: `${w + num}/${den}`, tag: 'frc.mixed_convert_add' },
        { text: `${num}/${den}`, tag: 'frc.mixed_ignore_whole' },
        { text: `${improper}/${w * den}`, tag: null },
      ],
      hint: 'اضرب العدد الصحيح في المقام ثم أضف البسط — لا تجمع الصحيح إلى البسط مباشرة.',
      explanation: `${w} × ${den} = ${w * den}، ثم ${w * den} + ${num} = ${improper}. إذن الكسر ${improper}/${den}.`,
    });
  },

  /* -------------------------------------------------------------- decimals */

  'DEC.PV': (r, d) => {
    // Two shapes, drawn at random: one where the longer decimal is smaller, one where it is larger.
    // A bank that only ever punished "longer is bigger" would simply teach "shorter is bigger".
    const longerIsSmaller = r() < 0.5;
    const tenths = int(r, 3, 8);
    const short = Number((tenths / 10).toFixed(1));
    const hundredths = longerIsSmaller ? int(r, 10, tenths * 10 - 5) : int(r, tenths * 10 + 1, 99);
    const long = Number((hundredths / 100).toFixed(2));

    const larger = short > long ? short : long;
    const smaller = short > long ? long : short;

    return mcq(r, {
      skill: 'DEC.PV', difficulty: d,
      stem: 'أيّ العددين أكبر؟',
      expression: `${decText(short, 1)}   ,   ${decText(long, 2)}`,
      correct: decText(larger, 2),
      distractors: [
        {
          text: decText(smaller, 2),
          tag: smaller === long ? 'dec.longer_is_bigger' : 'dec.shorter_is_bigger',
        },
        { text: 'العددان متساويان', tag: null },
        { text: 'لا يمكن المقارنة', tag: null },
      ],
      hint: 'قارن منزلة بمنزلة بدءاً من الأعشار. عدد الأرقام بعد الفاصلة لا يقرّر شيئاً.',
      explanation: `${decText(larger, 2)} أكبر. قارن الأعشار أولاً، فإن تساوت فانتقل إلى الأجزاء من مئة.`,
    });
  },

  'DEC.ADD': (r, d) => {
    const aWhole = d === 'easy' ? int(r, 1, 9) : int(r, 10, 89);
    const aTenth = int(r, 1, 9); // never 0: a zero in the tenths hides the misalignment entirely
    const a = Number(`${aWhole}.${aTenth}`);
    const b = Number(`${d === 'easy' ? 0 : int(r, 1, 9)}.${int(r, 11, 99)}`);
    const correct = Number((a + b).toFixed(2));

    return mcq(r, {
      skill: 'DEC.ADD', difficulty: d,
      stem: 'احسب ناتج الجمع:',
      expression: `${decText(a, 1)} + ${decText(b, 2)}`,
      correct: decText(correct, 2),
      distractors: [
        { text: decText(Misconception.rightAlignDecimals(a, b), 2), tag: 'dec.right_align' },
      ],
      hint: 'حاذِ الفواصل تحت بعضها لا الأرقام الأخيرة، وأكمل المنازل الناقصة بأصفار على اليمين.',
      explanation: `${decText(a, 1)} تساوي ${a.toFixed(2)}، وبمحاذاة الفاصلتين: ${a.toFixed(2)} + ${b.toFixed(2)} = ${decText(correct, 2)}.`,
    });
  },

  'DEC.MUL': (r, d) => {
    const a = Number(`${d === 'easy' ? int(r, 1, 9) : int(r, 10, 39)}.${int(r, 1, 9)}`);
    const b = Number(`0.${d === 'hard' ? int(r, 11, 89) : int(r, 2, 9)}`);
    const correct = Number((a * b).toFixed(4));

    return mcq(r, {
      skill: 'DEC.MUL', difficulty: d,
      stem: 'احسب ناتج الضرب:',
      expression: `${decText(a, 1)} × ${decText(b, 2)}`,
      correct: decText(correct, 4),
      distractors: [
        {
          text: decText(Misconception.multiplyPointLikeAddition(a, b), 4),
          tag: 'dec.mul_align_point',
        },
      ],
      hint: 'اضرب الأرقام كأنها أعداد صحيحة، ثم عُدّ المنازل العشرية في العددين معاً واجمعها.',
      explanation: 'عدد المنازل العشرية في ناتج الضرب هو مجموع منازل العددين، لا أكبرهما كما في الجمع.',
    });
  },

  'DEC.DIV': (r, d) => {
    const divisorTenths = pick(r, d === 'easy' ? [2, 5] : [2, 4, 5, 8]);
    const b = Number((divisorTenths / 10).toFixed(1));
    const q = d === 'easy' ? int(r, 3, 9) : d === 'medium' ? int(r, 11, 39) : int(r, 41, 99);
    const a = Number((b * q).toFixed(2));

    return mcq(r, {
      skill: 'DEC.DIV', difficulty: d,
      stem: 'احسب ناتج القسمة:',
      expression: `${decText(a, 2)} ÷ ${decText(b, 1)}`,
      correct: S(q),
      distractors: [
        { text: decText(Misconception.divideWithoutShift(a, b), 4), tag: 'dec.div_no_shift' },
      ],
      hint: 'أزِح الفاصلة في المقسوم عليه حتى يصير عدداً صحيحاً، وأزِحها العدد نفسه من المنازل في المقسوم.',
      explanation: `اضرب الطرفين في 10: ${decText(a * 10, 1)} ÷ ${b * 10} = ${q}.`,
    });
  },

  'DEC.FRC.CONV': (r, d) => {
    const den = pick(r, d === 'easy' ? [2, 4, 5, 10] : d === 'medium' ? [4, 5, 8, 10] : [8, 16, 20, 25]);
    const num = int(r, 1, den - 1);
    const correct = Number((num / den).toFixed(4));

    return mcq(r, {
      skill: 'DEC.FRC.CONV', difficulty: d,
      stem: 'حوّل الكسر الآتي إلى عدد عشري:',
      expression: `${num}/${den}`,
      correct: decText(correct, 4),
      distractors: [
        {
          text: decText(Misconception.fractionAsDigits(frac(num, den)), 4),
          tag: 'dec.frc_read_digits',
        },
      ],
      hint: 'الكسر يعني قسمة: اقسم البسط على المقام، ولا تقرأ الرقمين كما يظهران بعد الفاصلة.',
      explanation: `${num} ÷ ${den} = ${decText(correct, 4)}.`,
    });
  },

  /* ------------------------------------------------------ ratio and proportion */

  'RAT.CONCEPT': (r, d) => {
    if (d === 'hard') {
      // A ratio is preserved by multiplying, not by adding the same amount to both terms.
      const a = int(r, 2, 6);
      const b = int(r, 3, 9);
      const k = int(r, 2, 5);
      const scaledA = a * k;

      return mcq(r, {
        skill: 'RAT.CONCEPT', difficulty: d,
        stem: `نسبة الدقيق إلى السكّر في وصفة هي ${a} : ${b}. إذا زِيد الدقيق ليصير ${scaledA}، فكم يصير السكّر للحفاظ على النسبة نفسها؟`,
        expression: null,
        correct: S(b * k),
        distractors: [
          {
            text: S(Misconception.ratioByAdding(a, b, scaledA)),
            tag: 'rat.additive_not_multiplicative',
          },
          { text: S(b), tag: 'rat.additive_not_multiplicative' },
        ],
        hint: 'النسبة تُحفَظ بالضرب في العدد نفسه، لا بإضافة المقدار نفسه إلى الطرفين.',
        explanation: `الدقيق تضاعف ${k} مرات (${a} × ${k} = ${scaledA})، فالسكّر كذلك: ${b} × ${k} = ${b * k}.`,
      });
    }

    const boys = int(r, 3, 12);
    const girls = int(r, 4, 15);
    const total = boys + girls;
    const g1 = gcd(boys, total);
    const g2 = gcd(boys, girls);

    return mcq(r, {
      skill: 'RAT.CONCEPT', difficulty: d,
      stem: `في صفّ عدد الأولاد فيه ${boys} وعدد البنات ${girls}. ما نسبة الأولاد إلى مجموع الطلاب في أبسط صورة؟`,
      expression: null,
      correct: `${boys / g1} : ${total / g1}`,
      distractors: [
        { text: `${boys / g2} : ${girls / g2}`, tag: 'rat.part_vs_whole' },
        { text: `${total / g1} : ${boys / g1}`, tag: null },
        { text: `${girls / g1} : ${total / g1}`, tag: null },
      ],
      hint: 'نسبة الجزء إلى الكل مقامها المجموع كلّه، لا الجزء الآخر وحده.',
      explanation: `المجموع ${boys} + ${girls} = ${total}، فالنسبة ${boys} : ${total} وتبسّط إلى ${boys / g1} : ${total / g1}.`,
    });
  },

  'RAT.PROPORTION': (r, d) => {
    if (d === 'hard') {
      // Not everything that comes in pairs is proportional. Doubling an age does not double a height,
      // and a student who reaches for cross-multiplication here has learned a procedure, not a relation.
      const age = int(r, 6, 7); // so that age * 2 lands in the 11-99 band, where the noun stays singular
      const doubled = age * 2;
      const height = int(r, 95, 125);

      return mcq(r, {
        skill: 'RAT.PROPORTION', difficulty: d,
        stem: `طول طفل عمره ${age} سنوات هو ${height} سم. ما طوله المتوقّع عند عمر ${doubled} سنة؟`,
        expression: null,
        correct: 'لا يمكن إيجاده بالتناسب',
        distractors: [
          { text: `${height * 2} سم`, tag: 'rat.non_proportional' },
          { text: `${height + age} سم`, tag: 'rat.non_proportional' },
          { text: `${Math.round(height * 1.5)} سم`, tag: null },
        ],
        hint: 'التناسب يصلح حين تتغيّر الكميتان بالنسبة نفسها. الطول لا يتضاعف بتضاعف العمر.',
        explanation: 'العلاقة بين العمر والطول ليست تناسبية، فالضرب التبادلي هنا يعطي رقماً بلا معنى.',
      });
    }

    const b = int(r, 2, 9);
    const k = int(r, 2, d === 'easy' ? 5 : 9);
    // a === b makes the proportion 1:1, and both misconception distractors then land exactly on the
    // correct answer and get dropped — leaving an item that measures nothing.
    let a = int(r, 2, 9);
    while (a === b) a = a === 9 ? 2 : a + 1;
    const e = b * k;
    const x = a * k;

    return mcq(r, {
      skill: 'RAT.PROPORTION', difficulty: d,
      stem: 'أوجد قيمة س في التناسب الآتي:',
      expression: `${a}/${b} = س/${e}`,
      correct: S(x),
      distractors: [
        { text: S(Number(((b * e) / a).toFixed(2))), tag: 'rat.cross_mult_wrong_pair' },
        { text: S(e - b + a), tag: 'rat.cross_mult_wrong_pair' },
      ],
      hint: 'في الضرب التبادلي يُضرب بسط كل نسبة في مقام الأخرى: س × ' + b + ' = ' + a + ' × ' + e + '.',
      explanation: `${a} × ${e} = ${a * e}، وبالقسمة على ${b} تكون س = ${x}.`,
    });
  },

  /* -------------------------------------------------------------- integers */

  'NUM.INT.CONCEPT': (r, d) => {
    const onNumberLine = r() < 0.5; // two phrasings, so the drawn items do not collide
    const small = int(r, 2, d === 'easy' ? 9 : 40);
    const big = small + int(r, 1, d === 'easy' ? 9 : 40);
    const a = -big;
    const b = d === 'hard' && r() < 0.4 ? small : -small;

    // -small is always the greater of two negatives; a positive b is greater still.
    const larger = b > a ? b : a;
    const smaller = b > a ? a : b;

    return mcq(r, {
      skill: 'NUM.INT.CONCEPT', difficulty: d,
      stem: onNumberLine ? 'أيّ العددين يقع إلى اليمين على خط الأعداد؟' : 'أيّ العددين أكبر؟',
      expression: `${a}   ,   ${b}`,
      correct: S(larger),
      distractors: [
        // The number with the larger absolute value, chosen because it "looks" bigger.
        { text: S(smaller), tag: Math.abs(smaller) > Math.abs(larger) ? 'int.magnitude_order' : null },
        { text: 'العددان متساويان', tag: null },
        { text: S(Math.abs(smaller)), tag: 'int.magnitude_order' },
      ],
      hint: 'على خط الأعداد كلّما اتجهت يميناً كبر العدد. السالب الأبعد عن الصفر هو الأصغر لا الأكبر.',
      explanation: `${larger} يقع على يمين ${smaller} على خط الأعداد، فهو أكبر.`,
    });
  },

  'NUM.INT.MULDIV': (r, d) => {
    const dividing = d === 'hard' && r() < 0.5;
    const a = int(r, 2, d === 'easy' ? 9 : 12);
    const q = int(r, 2, d === 'easy' ? 9 : 12);
    const product = a * q;

    if (dividing) {
      return mcq(r, {
        skill: 'NUM.INT.MULDIV', difficulty: d,
        stem: 'احسب ناتج القسمة:',
        expression: `(−${product}) ÷ (−${a})`,
        correct: S(q),
        distractors: [
          { text: S(-q), tag: 'int.neg_times_neg' },
          { text: S(-(product + a)), tag: 'int.apply_add_rules' },
        ],
        hint: 'إشارتان متماثلتان في القسمة تعطيان ناتجاً موجباً — القاعدة نفسها كالضرب.',
        explanation: `(−${product}) ÷ (−${a}) = ${q}، لأن السالب مقسوماً على السالب موجب.`,
      });
    }

    return mcq(r, {
      skill: 'NUM.INT.MULDIV', difficulty: d,
      stem: 'احسب ناتج الضرب:',
      expression: `(−${a}) × (−${q})`,
      correct: S(product),
      distractors: [
        { text: S(-product), tag: 'int.neg_times_neg' },
        { text: S(-(a + q)), tag: 'int.apply_add_rules' },
      ],
      hint: 'قواعد إشارات الضرب ليست قواعد الجمع: سالب × سالب = موجب.',
      explanation: `(−${a}) × (−${q}) = ${product}. أمّا (−${a}) + (−${q}) = ${-(a + q)} فتلك عملية أخرى.`,
    });
  },

  /* ------------------------------------------------- expressions and powers */

  'ALG.EXPR': (r, d) => {
    if (d === 'hard') {
      const [many, few] = pick(r, [
        ['الأبقار', 'الخيول'],
        ['الأقلام', 'الدفاتر'],
        ['التفاحات', 'البرتقالات'],
      ]);
      const k = int(r, 3, 9);

      return mcq(r, {
        skill: 'ALG.EXPR', difficulty: d,
        stem: `عدد ${many} يساوي ${k} أضعاف عدد ${few}. إذا كان عدد ${few} هو ص وعدد ${many} هو ع، فأيّ عبارة صحيحة؟`,
        expression: null,
        correct: `ع = ${k}ص`,
        distractors: [
          // The letters read as labels for the objects rather than as their counts, so the equation
          // comes out reversed — "one horse for every four cows".
          { text: `ص = ${k}ع`, tag: 'alg.var_as_label' },
          { text: `ع = ص + ${k}`, tag: null },
          { text: `ع = ص ÷ ${k}`, tag: null },
        ],
        hint: 'الحرف يمثّل عدد الأشياء لا الشيء نفسه. اختبر بعدد: لو كان عدد ' + few + ' اثنين، فكم يكون عدد ' + many + '؟',
        explanation: `عدد ${many} أكبر، فهو الذي يُضرب في ${k}: ع = ${k}ص.`,
      });
    }

    const c = int(r, 2, 9);
    const v = int(r, 2, 9);
    const k = int(r, 1, d === 'easy' ? 9 : 20);

    return mcq(r, {
      skill: 'ALG.EXPR', difficulty: d,
      stem: `إذا كانت س = ${v}، فما قيمة العبارة الآتية؟`,
      expression: `${c}س + ${k}`,
      correct: S(c * v + k),
      distractors: [
        { text: S(Misconception.concatCoefficient(c, v) + k), tag: 'alg.concat_not_multiply' },
        { text: S(c + v + k), tag: 'alg.concat_not_multiply' },
      ],
      hint: `${c}س تعني ${c} × س، لا الرقمين متجاورين.`,
      explanation: `${c} × ${v} = ${c * v}، ثم ${c * v} + ${k} = ${c * v + k}.`,
    });
  },

  'NUM.POWERS': (r, d) => {
    if (d === 'easy') {
      const base = int(r, 2, 7);
      const exp = int(r, 2, 4);

      return mcq(r, {
        skill: 'NUM.POWERS', difficulty: d,
        stem: 'احسب قيمة القوّة الآتية:',
        expression: `${base}${sup(exp)}`,
        correct: S(base ** exp),
        distractors: [
          { text: S(base * exp), tag: 'pow.multiply_base_exp' },
          { text: S(base + exp), tag: 'pow.multiply_base_exp' },
        ],
        hint: `${base}${sup(exp)} تعني ضرب ${base} في نفسه ${exp} مرات، لا ${base} × ${exp}.`,
        explanation: `${Array(exp).fill(base).join(' × ')} = ${base ** exp}.`,
      });
    }

    if (d === 'medium') {
      // Even exponents only. With an odd one, (-b)^e IS -(b^e), so the distractor that is meant to
      // show the difference between them becomes the correct answer and disappears.
      const base = int(r, 2, 9);
      const exp = pick(r, [2, 4]);
      const value = (-base) ** exp;

      return mcq(r, {
        skill: 'NUM.POWERS', difficulty: d,
        stem: 'احسب قيمة القوّة الآتية:',
        expression: `(−${base})${sup(exp)}`,
        correct: S(value),
        distractors: [
          // −base^exp: the minus left outside the power, which is a different expression entirely.
          { text: S(-(base ** exp)), tag: 'pow.negative_base' },
          { text: S(base * exp), tag: 'pow.multiply_base_exp' },
        ],
        hint: 'القوس يضع الإشارة داخل القوّة. أسٌّ زوجي يعطي ناتجاً موجباً، وفردي يبقيه سالباً.',
        explanation: `الأس ${exp} زوجي، فالناتج موجب: (−${base})${sup(exp)} = ${value}. أمّا −${base}${sup(exp)} فالإشارة فيها خارج القوّة.`,
      });
    }

    const base = int(r, 2, 4);
    const m = int(r, 2, 4);
    const n = int(r, 2, 4);

    return mcq(r, {
      skill: 'NUM.POWERS', difficulty: d,
      stem: 'احسب ناتج الجمع:',
      expression: `${base}${sup(m)} + ${base}${sup(n)}`,
      correct: S(base ** m + base ** n),
      distractors: [
        // Adding the exponents is the rule for MULTIPLYING powers, not for adding them.
        { text: S(base ** (m + n)), tag: 'pow.add_exponents_wrong' },
        { text: S(base * (m + n)), tag: null },
      ],
      hint: 'جمع الأسس قانونٌ لضرب القوى لا لجمعها. احسب كل قوّة على حدة ثم اجمع.',
      explanation: `${base}${sup(m)} = ${base ** m} و ${base}${sup(n)} = ${base ** n}، والمجموع ${base ** m + base ** n}.`,
    });
  },

  'NUM.ROOTS': (r, d) => {
    if (d === 'hard') {
      const [p, q, h] = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [20, 21, 29]]);
      const k = int(r, 1, 3);
      const a = (p * k) ** 2;
      const b = (q * k) ** 2;

      return mcq(r, {
        skill: 'NUM.ROOTS', difficulty: d,
        stem: 'احسب قيمة الجذر الآتي:',
        expression: `√(${a} + ${b})`,
        correct: S(h * k),
        distractors: [
          { text: S(Misconception.rootOverSum(a, b)), tag: 'root.distribute_over_add' },
          { text: S((a + b) / 2), tag: 'root.half_the_number' },
        ],
        hint: 'اجمع ما تحت الجذر أولاً. الجذر لا يُوزَّع على الجمع.',
        explanation: `${a} + ${b} = ${a + b}، وجذره ${h * k}. أمّا √${a} + √${b} = ${p * k + q * k} فعملية أخرى.`,
      });
    }

    const root = d === 'easy' ? int(r, 2, 12) : int(r, 11, 30);
    const square = root ** 2;

    return mcq(r, {
      skill: 'NUM.ROOTS', difficulty: d,
      stem: 'احسب قيمة الجذر الآتي:',
      expression: `√${square}`,
      correct: S(root),
      distractors: [
        { text: S(square / 2), tag: 'root.half_the_number' },
        { text: S(square / 4), tag: 'root.half_the_number' },
      ],
      hint: `اسأل: أيّ عدد إذا ضُرب في نفسه أعطى ${square}؟ الجذر ليس نصف العدد.`,
      explanation: `${root} × ${root} = ${square}، إذن √${square} = ${root}.`,
    });
  },

  'ALG.EQ.MULTI': (r, d) => {
    const x = int(r, 2, d === 'easy' ? 9 : 15);

    if (d === 'hard') {
      const k = int(r, 3, 5);
      const p = int(r, 1, 9);
      const c = int(r, 1, k - 2); // same reason as below: a gap of 1 collapses the distractor
      const e = k * (x + p) - c * x;

      return mcq(r, {
        skill: 'ALG.EQ.MULTI', difficulty: d,
        stem: 'أوجد قيمة س:',
        expression: `${k}(س + ${p}) = ${coef(c)}س + ${e}`,
        correct: S(x),
        distractors: [
          { text: S(e - k * p), tag: 'eq.vars_both_sides' },
          { text: S(Number(((e - k * p) / k).toFixed(2))), tag: null },
        ],
        hint: 'وزّع أولاً، ثم انقل كل حدود س إلى طرف واحد وكل الأعداد إلى الطرف الآخر.',
        explanation: `${k}س + ${k * p} = ${coef(c)}س + ${e}، فـ ${coef(k - c)}س = ${e - k * p}، إذن س = ${x}.`,
      });
    }

    const a = int(r, 3, 9);
    // The gap between the coefficients must be at least 2: at 1, (e - b) equals x and the
    // "never collected the variables" distractor silently becomes the right answer.
    const c = int(r, 1, a - 2);
    const b = int(r, 1, d === 'easy' ? 9 : 25);
    const e = a * x + b - c * x;

    return mcq(r, {
      skill: 'ALG.EQ.MULTI', difficulty: d,
      stem: 'أوجد قيمة س:',
      expression: `${a}س + ${b} = ${coef(c)}س + ${e}`,
      correct: S(x),
      distractors: [
        // Constants moved, variables left where they were: (a−c) never gets collected.
        { text: S(e - b), tag: 'eq.vars_both_sides' },
        { text: S(Number(((e - b) / a).toFixed(2))), tag: 'eq.vars_both_sides' },
      ],
      hint: `اطرح ${coef(c)}س من الطرفين أولاً حتى تجتمع س في طرف واحد، ثم عالج الأعداد.`,
      explanation: `بطرح ${coef(c)}س: ${coef(a - c)}س + ${b} = ${e}، ثم ${coef(a - c)}س = ${e - b}، إذن س = ${x}.`,
    });
  },
};
