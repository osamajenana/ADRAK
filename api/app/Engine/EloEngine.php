<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Keeps the question bank calibrated as students use it.
 *
 * The item drifts a quarter as fast as the student, so a bank tunes itself over thousands of
 * attempts without one answer jerking it around.
 *
 * Elo NEVER decides mastery — it only orders candidate questions within a skill. A miscalibrated
 * item can waste a student's time; it cannot mark them mastered. That is MasteryEngine's job and
 * only MasteryEngine's job.
 *
 * @see engine-spec/SPEC.md#5
 */
final class EloEngine
{
    public const K_STUDENT = 32;

    public const K_ITEM = 8;

    /** @return array{theta: float, item_elo: float} */
    public static function update(float $theta, float $itemElo, bool $correct): array
    {
        $expected = 1 / (1 + 10 ** (($itemElo - $theta) / 400));
        $c = $correct ? 1 : 0;

        return [
            'theta' => Num::round2($theta + self::K_STUDENT * ($c - $expected)),
            'item_elo' => Num::round2($itemElo + self::K_ITEM * ($expected - $c)),
        ];
    }
}
