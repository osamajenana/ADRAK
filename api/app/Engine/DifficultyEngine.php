<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Chooses the difficulty of the next exercise.
 *
 * @see engine-spec/SPEC.md#2
 */
final class DifficultyEngine
{
    public const PROMOTE_AFTER = 2;

    public const DEMOTE_AFTER = 2;

    public const ROUTE_AFTER_WRONG_AT_EASY = 3;

    /**
     * The caller increments the relevant counter for the answer just given, then calls this.
     * First matching rule wins.
     */
    public static function next(
        Difficulty $difficulty,
        int $consecutiveCorrect,
        int $consecutiveWrong,
    ): DifficultyDecision {
        // Three wrong in a row at the easiest level means the gap is below this skill. More
        // practice here would just be a child failing repeatedly, which is the exact experience
        // this product exists to end.
        if ($difficulty === Difficulty::Easy && $consecutiveWrong >= self::ROUTE_AFTER_WRONG_AT_EASY) {
            return new DifficultyDecision(
                Difficulty::Easy,
                DifficultyAction::RouteToPrerequisite,
                0,
                0,
            );
        }

        if ($consecutiveWrong >= self::DEMOTE_AFTER) {
            $lower = $difficulty->demote();

            return $lower !== $difficulty
                ? new DifficultyDecision($lower, DifficultyAction::Demote, 0, 0)
                // Already at the floor. The wrong-counter is deliberately NOT reset, so it can
                // keep climbing to the routing threshold above.
                : new DifficultyDecision(Difficulty::Easy, DifficultyAction::Stay, 0, $consecutiveWrong);
        }

        if ($consecutiveCorrect >= self::PROMOTE_AFTER) {
            $higher = $difficulty->promote();

            return $higher !== $difficulty
                ? new DifficultyDecision($higher, DifficultyAction::Promote, 0, 0)
                : new DifficultyDecision(Difficulty::Hard, DifficultyAction::Stay, $consecutiveCorrect, 0);
        }

        return new DifficultyDecision($difficulty, DifficultyAction::Stay, $consecutiveCorrect, $consecutiveWrong);
    }
}
