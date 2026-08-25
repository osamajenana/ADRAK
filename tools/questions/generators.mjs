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
  int, pick, mcq, frac, fracText, addFrac, mulFrac, divFrac, lcm, Misconception,
} from './lib.mjs';

const S = (x) => String(x);

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
};
