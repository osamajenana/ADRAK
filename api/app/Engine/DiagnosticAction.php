<?php

declare(strict_types=1);

namespace App\Engine;

enum DiagnosticAction: string
{
    case Probe = 'probe';
    case Finish = 'finish';
}
