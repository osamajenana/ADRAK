<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Schedules the spaced review of a mastered skill.
 *
 * Retention, not just attainment: a skill reached in March and never revisited is gone by June.
 *
 * Deliberately not SM-2. SM-2 needs a self-rated recall quality, and asking a twelve-year-old in a
 * tent school to grade their own memory produces a number nobody should schedule on.
 *
 * Takes the timestamp rather than reading the clock, which is what makes offline replay and
 * server-side recomputation from the event log agree.
 *
 * @see engine-spec/SPEC.md#6
 */
final class ReviewEngine
{
    /** @var list<int> */
    public const INTERVALS_DAYS = [7, 21, 60];

    private const DAY_SECONDS = 86400;

    public static function nextReviewAt(int $masteredAt, int $reviewCount): int
    {
        $i = min($reviewCount, count(self::INTERVALS_DAYS) - 1);

        return $masteredAt + self::INTERVALS_DAYS[$i] * self::DAY_SECONDS;
    }
}
