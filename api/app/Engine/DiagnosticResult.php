<?php

declare(strict_types=1);

namespace App\Engine;

final readonly class DiagnosticResult
{
    /**
     * @param  list<string>  $mastered
     * @param  list<string>  $weak  partial knowledge — worth revisiting, not reteaching
     * @param  list<string>  $missing
     */
    public function __construct(
        public int $estimatedLevel,
        public int $frontierIndex,
        public array $mastered,
        public array $weak,
        public array $missing,
    ) {}

    /**
     * @return array{
     *     estimated_level: int,
     *     frontier_index: int,
     *     mastered: list<string>,
     *     weak: list<string>,
     *     missing: list<string>,
     * }
     */
    public function toArray(): array
    {
        return [
            'estimated_level' => $this->estimatedLevel,
            'frontier_index' => $this->frontierIndex,
            'mastered' => $this->mastered,
            'weak' => $this->weak,
            'missing' => $this->missing,
        ];
    }
}
