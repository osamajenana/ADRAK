<?php

declare(strict_types=1);

namespace App\Engine;

final readonly class MasteryResult
{
    public function __construct(
        public float $score,
        public MasteryStatus $status,
        public int $attempts,
        public int $correct,
        public int $hardCorrect,
    ) {}

    /** @return array{score: float, status: string, attempts: int, correct: int, hard_correct: int} */
    public function toArray(): array
    {
        return [
            'score' => $this->score,
            'status' => $this->status->value,
            'attempts' => $this->attempts,
            'correct' => $this->correct,
            'hard_correct' => $this->hardCorrect,
        ];
    }
}
