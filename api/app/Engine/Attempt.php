<?php

declare(strict_types=1);

namespace App\Engine;

/** One answered question, as the mastery score sees it. */
final readonly class Attempt
{
    public function __construct(
        public bool $correct,
        public Difficulty $difficulty,
    ) {}

    /** @param array{correct: bool, difficulty: string} $row */
    public static function fromArray(array $row): self
    {
        return new self($row['correct'], Difficulty::from($row['difficulty']));
    }
}
