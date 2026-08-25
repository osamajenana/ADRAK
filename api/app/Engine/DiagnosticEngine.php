<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Locates a student's real working level by binary search over a topologically sorted skill list.
 *
 * Prerequisites always sort before their dependents, so a pass at index i is evidence about
 * everything below it and a fail is evidence about everything above it. That turns "what does this
 * child actually know" into O(log n) probes — around twelve questions instead of a forty-question
 * placement paper a displaced student will never sit through.
 *
 * @see engine-spec/SPEC.md#3
 */
final class DiagnosticEngine
{
    public const MAX_QUESTIONS = 15;

    public const PROBE_SIZE = 3;

    /** 2 of 3. One lucky guess should not promote a skill; one slip should not condemn it. */
    public const PROBE_PASS_MARK = 2;

    public static function next(DiagnosticState $state): DiagnosticDecision
    {
        // Never start a probe that cannot be finished inside the budget.
        $outOfBudget = $state->asked + $state->probeSize > $state->maxQuestions;

        // Frontier located: the highest pass and the lowest fail are now adjacent.
        $frontierFound = $state->hi - $state->lo <= 1;

        if ($outOfBudget || $frontierFound) {
            return new DiagnosticDecision(DiagnosticAction::Finish, null, $state->lo, $state->hi);
        }

        $mid = intdiv($state->lo + $state->hi, 2);

        return new DiagnosticDecision(
            DiagnosticAction::Probe,
            $state->candidates[$mid],
            $state->lo,
            $state->hi,
        );
    }

    /**
     * @param  array<string, int>  $gradeOf  skill_code => grade_level
     */
    public static function result(DiagnosticState $state, array $gradeOf): DiagnosticResult
    {
        $probeByCode = [];
        foreach ($state->probes as $probe) {
            $probeByCode[$probe['skill_code']] = $probe;
        }

        $mastered = [];
        $weak = [];
        $missing = [];

        foreach ($state->candidates as $i => $code) {
            // Measured evidence outranks inferred evidence.
            if (isset($probeByCode[$code])) {
                $correct = $probeByCode[$code]['correct'];
                if ($correct >= 2) {
                    $mastered[] = $code;
                } elseif ($correct === 1) {
                    $weak[] = $code;
                } else {
                    $missing[] = $code;
                }

                continue;
            }

            if ($i <= $state->lo) {
                $mastered[] = $code;
            } else {
                $missing[] = $code;
            }
        }

        $estimatedLevel = $state->lo >= 0
            ? $gradeOf[$state->candidates[$state->lo]]
            : min(array_map(static fn (string $c): int => $gradeOf[$c], $state->candidates));

        return new DiagnosticResult($estimatedLevel, $state->lo, $mastered, $weak, $missing);
    }
}
