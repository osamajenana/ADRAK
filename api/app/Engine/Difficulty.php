<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Question difficulty. Ordered easy < medium < hard.
 *
 * @see engine-spec/SPEC.md
 */
enum Difficulty: string
{
    case Easy = 'easy';
    case Medium = 'medium';
    case Hard = 'hard';

    /**
     * Weight used by the mastery score. A correct `hard` answer is worth twice a correct `easy`
     * one, so a run of easy wins cannot carry a student over the threshold on its own.
     */
    public function weight(): float
    {
        return match ($this) {
            self::Easy => 1.0,
            self::Medium => 1.5,
            self::Hard => 2.0,
        };
    }

    /** One step up, saturating at hard. */
    public function promote(): self
    {
        return match ($this) {
            self::Easy => self::Medium,
            self::Medium, self::Hard => self::Hard,
        };
    }

    /** One step down, saturating at easy. */
    public function demote(): self
    {
        return match ($this) {
            self::Hard => self::Medium,
            self::Medium, self::Easy => self::Easy,
        };
    }
}
