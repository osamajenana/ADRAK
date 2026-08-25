<?php

declare(strict_types=1);

namespace App\Engine;

final readonly class DifficultyDecision
{
    public function __construct(
        public Difficulty $difficulty,
        public DifficultyAction $action,
        public int $consecutiveCorrect,
        public int $consecutiveWrong,
    ) {}

    /** @return array{difficulty: string, action: string, consecutive_correct: int, consecutive_wrong: int} */
    public function toArray(): array
    {
        return [
            'difficulty' => $this->difficulty->value,
            'action' => $this->action->value,
            'consecutive_correct' => $this->consecutiveCorrect,
            'consecutive_wrong' => $this->consecutiveWrong,
        ];
    }
}
