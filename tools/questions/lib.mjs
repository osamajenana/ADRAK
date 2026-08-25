/**
 * Question-bank generation primitives.
 *
 * The central idea: a distractor is not invented, it is COMPUTED by executing the misconception.
 * `2/5` is offered for `1/2 + 1/3` because addAcross() actually adds numerators and denominators.
 * That means every option's `misconception_tag` is provably what the option represents, which is
 * what makes the teacher dashboard's misconception analytics trustworthy rather than decorative.
 *
 * Everything is deterministic: a seeded PRNG, no Math.random, no clock. Same seed, same bank.
 */

/* ------------------------------------------------------------------ random */

/** mulberry32 — small, fast, and identical across runs. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r, min, max) => min + Math.floor(r() * (max - min + 1));
export const pick = (r, xs) => xs[Math.floor(r() * xs.length)];

/** Fisher-Yates with the supplied PRNG, so option order is stable per seed. */
export function shuffle(r, xs) {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* --------------------------------------------------------------- fractions */

export const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
export const lcm = (a, b) => Math.abs(a * b) / gcd(a, b);

export const frac = (n, d) => ({ n, d });

export function reduce({ n, d }) {
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
}

export const fracEq = (a, b) => {
  const x = reduce(a);
  const y = reduce(b);
  return x.n === y.n && x.d === y.d;
};

/** Renders 3/1 as "3" and 0/n as "0" so options never read like a puzzle. */
export function fracText({ n, d }) {
  const r = reduce({ n, d });
  if (r.n === 0) return '0';
  if (r.d === 1) return String(r.n);
  return `${r.n}/${r.d}`;
}

export const addFrac = (a, b) => reduce(frac(a.n * b.d + b.n * a.d, a.d * b.d));
export const subFrac = (a, b) => reduce(frac(a.n * b.d - b.n * a.d, a.d * b.d));
export const mulFrac = (a, b) => reduce(frac(a.n * b.n, a.d * b.d));
export const divFrac = (a, b) => reduce(frac(a.n * b.d, a.d * b.n));

/* ---------------------------------------------- misconceptions as functions */

/**
 * Each entry EXECUTES a documented student error. Named after the tag it produces so a reader can
 * check the code against the tag catalogue in content/skill-graph.json.
 */
export const Misconception = {
  /** frc.add_across — "1/2 + 1/3 = 2/5": adds numerators and denominators straight across. */
  addAcross: (a, b) => frac(a.n + b.n, a.d + b.d),

  /** frc.add_denominators_like — keeps adding the denominator even when it is shared. */
  addLikeDenominators: (a, b) => frac(a.n + b.n, a.d + b.d),

  /** frc.lcm_only_one — finds the common denominator but converts only the first fraction. */
  convertOnlyFirst: (a, b) => {
    const L = lcm(a.d, b.d);
    return reduce(frac(a.n * (L / a.d) + b.n, L));
  },

  /** frc.mul_needs_common_denom — "helpfully" finds a common denominator before multiplying. */
  commonDenomBeforeMultiply: (a, b) => {
    const L = lcm(a.d, b.d);
    return reduce(frac(a.n * (L / a.d) * (b.n * (L / b.d)), L));
  },

  /** frc.div_flip_wrong — inverts the dividend instead of the divisor. */
  flipFirstFraction: (a, b) => reduce(frac(a.d * b.d, a.n * b.n)),

  /** sub.smaller_from_larger — column subtraction that always takes the smaller digit away. */
  subtractSmallerDigit: (a, b) => {
    const A = String(a).split('').reverse();
    const B = String(b).padStart(A.length, '0').split('').reverse();
    const digits = A.map((d, i) => Math.abs(Number(d) - Number(B[i] ?? 0)));
    return Number(digits.reverse().join(''));
  },

  /** add.no_carry — adds each column independently and drops every carry. */
  addWithoutCarry: (a, b) => {
    const A = String(a).split('').reverse();
    const B = String(b).split('').reverse();
    const len = Math.max(A.length, B.length);
    const digits = [];
    for (let i = 0; i < len; i++) {
      digits.push((Number(A[i] ?? 0) + Number(B[i] ?? 0)) % 10);
    }
    return Number(digits.reverse().join('')) || 0;
  },

  /** int.ignore_signs — computes with magnitudes, then keeps the sign of the first term. */
  ignoreSigns: (a, b) => Math.abs(a) + Math.abs(b),

  /** int.sub_always_smaller — treats "minus a negative" as an ordinary subtraction. */
  subtractInsteadOfAdd: (a, b) => a - Math.abs(b),

  /** ord.left_to_right — evaluates strictly left to right, ignoring precedence. */
  leftToRight: (terms, ops) =>
    ops.reduce((acc, op, i) => {
      const rhs = terms[i + 1];
      return op === '+' ? acc + rhs : op === '-' ? acc - rhs : op === '×' ? acc * rhs : acc / rhs;
    }, terms[0]),

  /** pct.multiply_by_number — "25% of 80" read as 25 × 80, forgetting the division by 100. */
  percentAsMultiplier: (pct, whole) => pct * whole,

  /** alg.combine_unlike — folds a constant into the coefficient: 3x + 2 becomes 5x. */
  combineUnlikeTerms: (coefficient, constant) => coefficient + constant,

  /** eq.one_side_only — applies the inverse operation to one side of the equation only. */
  oneSideOnly: (rhs) => rhs,

  /** dec.longer_is_bigger — "0.25 > 0.7" because it has more digits. */
  longerDecimalIsBigger: (a, b) => (String(a).length >= String(b).length ? a : b),
};

/* ----------------------------------------------------------------- builders */

/**
 * Assembles one MCQ. Distractors that collide with the correct answer (or with each other) are
 * dropped rather than silently offered twice, and the gap is filled with untagged near-misses so
 * the question still has four options. An untagged option carries no analytics signal, which is
 * the honest outcome — better than mislabelling it.
 */
export function mcq(r, { skill, difficulty, stem, expression, correct, distractors, hint, explanation }) {
  const seen = new Set([correct]);
  const options = [{ text_ar: correct, is_correct: true, misconception_tag: null }];

  for (const { text, tag } of distractors) {
    if (text == null || seen.has(text)) continue;
    seen.add(text);
    options.push({ text_ar: text, is_correct: false, misconception_tag: tag });
    if (options.length === 4) break;
  }

  // Pad with plausible neighbours when the misconceptions collapsed onto the correct answer.
  let guard = 0;
  while (options.length < 4 && guard++ < 40) {
    const filler = nearMiss(r, correct);
    if (filler == null || seen.has(filler)) continue;
    seen.add(filler);
    options.push({ text_ar: filler, is_correct: false, misconception_tag: null });
  }

  return {
    skill_code: skill,
    type: 'mcq',
    difficulty,
    stem_ar: stem,
    // Math is kept out of the Arabic prose and rendered in its own LTR run. Inline it and the
    // bidi algorithm reorders "2x + 3 = 11" the moment an Arabic word sits beside it.
    expression: expression ?? null,
    hint_ar: hint,
    explanation_ar: explanation,
    options: shuffle(r, options),
  };
}

/** A believable wrong answer of the same shape: off-by-a-little, never wildly different. */
function nearMiss(r, correct) {
  const asFraction = /^(-?\d+)\/(\d+)$/.exec(correct);
  if (asFraction) {
    const n = Number(asFraction[1]);
    const d = Number(asFraction[2]);
    const delta = pick(r, [-2, -1, 1, 2]);
    return r() < 0.5 ? fracText(frac(n + delta, d)) : fracText(frac(n, Math.max(2, d + delta)));
  }

  const asNumber = Number(correct);
  if (Number.isFinite(asNumber)) {
    const decimals = (correct.split('.')[1] ?? '').length;
    const step = decimals ? 10 ** -decimals : Math.abs(asNumber) > 40 ? 10 : 1;
    const delta = pick(r, [-2, -1, 1, 2]) * step;
    const value = asNumber + delta;
    return decimals ? value.toFixed(decimals) : String(Math.round(value));
  }

  return null;
}

/** Numeric-entry question: no options, so no distractors and no misconception signal. */
export function numeric(_r, { skill, difficulty, stem, expression, correct, hint, explanation }) {
  return {
    skill_code: skill,
    type: 'numeric',
    difficulty,
    stem_ar: stem,
    expression: expression ?? null,
    hint_ar: hint,
    explanation_ar: explanation,
    options: [{ text_ar: String(correct), is_correct: true, misconception_tag: null }],
  };
}
