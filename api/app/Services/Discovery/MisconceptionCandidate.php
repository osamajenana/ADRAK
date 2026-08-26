<?php

declare(strict_types=1);

namespace App\Services\Discovery;

/**
 * A wrong answer that many students chose and that nothing in the catalogue explains.
 *
 * The catalogue was written up front from what the literature and a curriculum author already
 * know. This is the other kind: a pattern the data found on its own, which nobody thought to look
 * for. Whether it is a real misconception or a coincidence is exactly the question the AI pass is
 * asked to answer — and a human decides whether the answer is right.
 */
final readonly class MisconceptionCandidate
{
    /**
     * @param  list<array{stem: string, expression: string|null, correct: string}>  $examples
     */
    public function __construct(
        public int $skillId,
        public string $skillCode,
        public string $skillName,
        public string $chosenAnswer,
        public int $studentCount,
        public int $occurrences,
        public array $examples,
    ) {}
}
