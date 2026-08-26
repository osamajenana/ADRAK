/**
 * Rounds to two decimals exactly the way engine-spec/SPEC.md pins it down.
 *
 * Spelled out rather than using Math.round because PHP's round() and JavaScript's disagree on
 * negative half-values. Engine outputs are non-negative today, so the two agree in practice — but
 * this client and the server score the same student, and a rule that merely happens to hold is not
 * a rule.
 */
export const round2 = (x: number): number => Math.floor(x * 100 + 0.5) / 100;
