<?php

declare(strict_types=1);

namespace App\Engine;

/** Where a student stands on one skill. Persisted on student_skills.status. */
enum MasteryStatus: string
{
    case NotStarted = 'not_started';
    case Learning = 'learning';
    case Mastered = 'mastered';
}
