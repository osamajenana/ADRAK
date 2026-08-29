<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Decides whether a student has mastered a skill.
 *
 * Three conditions, all of which a teacher can check by hand on the screen — that is the design
 * constraint, not an implementation detail. A teacher who cannot see why the system says "mastered"
 * will not trust it, and a recovery plan a teacher does not trust does not get taught.
 *
 * This is deliberately not a model. The AI in ADRAK writes hints and simplified explanations; it is
 * never allowed near this decision.
 *
 * @see engine-spec/SPEC.md#1
 */
final class MasteryEngine
{
    public const DEFAULT_THRESHOLD = 85;

    /** Blocks mastery declared on a thin sample. */
    public const MIN_ATTEMPTS = 8;

    /** Blocks mastery that was never tested at depth. */
    public const MIN_HARD_CORRECT = 2;

    private const RECENCY_DECAY = 0.9;

    /**
     * @param  list<Attempt>  $attempts  oldest first — the order is part of the spec, because
     *                                   IEEE-754 addition is not associative and a different
     *                                   traversal shifts the second decimal against the client
     * @param  int  $threshold  the skill's own mastery_threshold
     */
    public static function evaluate(array $attempts, int $threshold = self::DEFAULT_THRESHOLD): MasteryResult
    {
        $n = count($attempts);

        if ($n === 0) {
            return new MasteryResult(0.0, MasteryStatus::NotStarted, 0, 0, 0);
        }

        $numerator = 0.0;
        $denominator = 0.0;
        $correct = 0;
        $hardCorrect = 0;

        foreach ($attempts as $i => $attempt) {
            // The newest attempt carries full weight; each older one decays by 10%. A student who
            // struggled a month ago and is solid now should read as solid now.
            $weight = $attempt->difficulty->weight() * self::RECENCY_DECAY ** ($n - 1 - $i);
            $denominator += $weight;

            if ($attempt->correct) {
                $numerator += $weight;
                $correct++;
                if ($attempt->difficulty === Difficulty::Hard) {
                    $hardCorrect++;
                }
            }
        }

        $score = Num::round2(100 * $numerator / $denominator);

        $mastered = $score >= $threshold
            && $n >= self::MIN_ATTEMPTS
            && $hardCorrect >= self::MIN_HARD_CORRECT;

        return new MasteryResult(
            $score,
            $mastered ? MasteryStatus::Mastered : MasteryStatus::Learning,
            $n,
            $correct,
            $hardCorrect,
        );
    }
}
