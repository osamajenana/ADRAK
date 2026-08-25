<?php

declare(strict_types=1);

namespace App\Engine;

/** Immutable search state for one diagnostic sitting. */
final readonly class DiagnosticState
{
    /**
     * @param  list<string>  $candidates  skills at or below the student's grade, ascending order_index
     * @param  list<array{skill_code: string, correct: int, total: int}>  $probes
     * @param  int  $lo  highest passed index, -1 if none      (exclusive lower bound)
     * @param  int  $hi  lowest failed index, count() if none  (exclusive upper bound)
     */
    public function __construct(
        public int $grade,
        public array $candidates,
        public array $probes,
        public int $lo,
        public int $hi,
        public int $asked,
        public int $maxQuestions = DiagnosticEngine::MAX_QUESTIONS,
        public int $probeSize = DiagnosticEngine::PROBE_SIZE,
    ) {}

    /** @param  list<string>  $candidates */
    public static function start(
        int $grade,
        array $candidates,
        int $maxQuestions = DiagnosticEngine::MAX_QUESTIONS,
        int $probeSize = DiagnosticEngine::PROBE_SIZE,
    ): self {
        return new self($grade, $candidates, [], -1, count($candidates), 0, $maxQuestions, $probeSize);
    }

    /**
     * Folds one completed probe into the search bounds.
     *
     * @param  array{skill_code: string, correct: int, total: int}  $probe
     */
    public function withProbe(array $probe): self
    {
        $index = (int) array_search($probe['skill_code'], $this->candidates, strict: true);
        $passed = $probe['correct'] >= DiagnosticEngine::PROBE_PASS_MARK;

        return new self(
            $this->grade,
            $this->candidates,
            [...$this->probes, $probe],
            $passed ? $index : $this->lo,
            $passed ? $this->hi : $index,
            $this->asked + $probe['total'],
            $this->maxQuestions,
            $this->probeSize,
        );
    }
}
