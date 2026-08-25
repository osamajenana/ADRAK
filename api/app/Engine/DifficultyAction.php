<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * What the difficulty engine decided after the last answer.
 *
 * RouteToPrerequisite is the signal that the gap sits BELOW this skill: the student has now failed
 * three in a row at the easiest level, so more practice here is not the answer. Resolving which
 * prerequisite to send them to belongs to the recovery path, not here.
 */
enum DifficultyAction: string
{
    case Stay = 'stay';
    case Promote = 'promote';
    case Demote = 'demote';
    case RouteToPrerequisite = 'route_to_prerequisite';
}
