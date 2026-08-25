<?php

declare(strict_types=1);

namespace App\Engine;

/** @internal Numeric conventions shared with the TypeScript engine. */
final class Num
{
    /**
     * Rounds to two decimals the way engine-spec/SPEC.md pins it down.
     *
     * PHP's round() and JavaScript's Math.round() disagree on negative half-values. Engine outputs
     * are non-negative today, so the two agree in practice — but the client and the server score
     * the same student, and a rule that happens to hold is not a rule. Spelling the arithmetic out
     * removes the question entirely.
     */
    public static function round2(float $x): float
    {
        return floor($x * 100 + 0.5) / 100;
    }
}
