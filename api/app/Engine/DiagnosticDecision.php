<?php

declare(strict_types=1);

namespace App\Engine;

final readonly class DiagnosticDecision
{
    public function __construct(
        public DiagnosticAction $action,
        public ?string $skillCode,
        public int $lo,
        public int $hi,
    ) {}

    /**
     * Mirrors the vector shape: `skill_code` is absent entirely on `finish`.
     *
     * @return array{action: string, lo: int, hi: int, skill_code?: string|null}
     */
    public function toArray(): array
    {
        return $this->action === DiagnosticAction::Finish
            ? ['action' => 'finish', 'lo' => $this->lo, 'hi' => $this->hi]
            : ['action' => 'probe', 'skill_code' => $this->skillCode, 'lo' => $this->lo, 'hi' => $this->hi];
    }
}
