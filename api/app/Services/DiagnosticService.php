<?php

declare(strict_types=1);

namespace App\Services;

use App\Engine\DiagnosticAction;
use App\Engine\DiagnosticEngine;
use App\Engine\DiagnosticResult;
use App\Engine\DiagnosticState;
use App\Engine\Difficulty;
use App\Models\DiagnosticAnswer;
use App\Models\DiagnosticTest;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use App\Models\Student;
use App\Models\Subject;
use Illuminate\Support\Facades\DB;

/**
 * Runs one diagnostic sitting.
 *
 * The engine is pure and knows nothing about the database; this service is the seam. Its one
 * non-obvious job is that it never stores the search state as the source of truth — it REPLAYS the
 * completed probes through the engine on every request and writes the result back as a cache. A
 * sitting interrupted by a dead battery, resumed on a different phone two days later, therefore
 * lands in exactly the state it left, and a bug in persistence can never quietly move a child's
 * assessed level.
 */
final class DiagnosticService
{
    public function __construct(
        private readonly SkillGraphService $graph,
        private readonly MasteryService $mastery,
        private readonly RecoveryPathService $recovery,
    ) {}

    public function start(Student $student, Subject $subject): DiagnosticTest
    {
        $existing = DiagnosticTest::query()
            ->where('student_id', $student->id)
            ->where('status', DiagnosticTest::STATUS_IN_PROGRESS)
            ->first();

        if ($existing !== null) {
            return $existing;
        }

        $candidates = $this->candidates($student->grade);

        return DiagnosticTest::create([
            'student_id' => $student->id,
            'subject_id' => $subject->id,
            'status' => DiagnosticTest::STATUS_IN_PROGRESS,
            'grade_at_start' => $student->grade,
            'lo' => -1,
            'hi' => count($candidates),
            'asked' => 0,
        ]);
    }

    /**
     * The next question to put on screen, or null when the walk is done.
     *
     * A probe is three questions on one skill, so this either continues the probe in flight or asks
     * the engine where to look next.
     */
    public function nextQuestion(DiagnosticTest $test): ?Question
    {
        $inFlight = $this->probeInFlight($test);

        if ($inFlight !== null) {
            return $this->pickQuestion($inFlight['skill_id'], $test);
        }

        $state = $this->replay($test);
        $decision = DiagnosticEngine::next($state);

        $this->persist($test, $state);

        if ($decision->action === DiagnosticAction::Finish) {
            return null;
        }

        $skillId = $this->graph->idLookup()[$decision->skillCode];

        return $this->pickQuestion($skillId, $test);
    }

    public function recordAnswer(DiagnosticTest $test, Question $question, ?QuestionOption $option): DiagnosticAnswer
    {
        $inFlight = $this->probeInFlight($test);
        $probeStep = $inFlight['probe_step'] ?? count($this->completedProbes($test));

        $answer = DiagnosticAnswer::create([
            'diagnostic_test_id' => $test->id,
            'question_id' => $question->id,
            'skill_id' => $question->skill_id,
            'selected_option_id' => $option?->id,
            'is_correct' => (bool) $option?->is_correct,
            'probe_step' => $probeStep,
        ]);

        $this->persist($test->fresh(), $this->replay($test->fresh()));

        return $answer;
    }

    /**
     * Closes the sitting: writes the inferred skill statuses and builds the recovery path.
     *
     * The result is computed from the replayed walk, not from the cached columns.
     */
    public function complete(DiagnosticTest $test): DiagnosticResult
    {
        $state = $this->replay($test);
        $result = DiagnosticEngine::result($state, $this->graph->gradeLookup());

        DB::transaction(function () use ($test, $result): void {
            $student = $test->student;

            $this->mastery->applyDiagnostic($student, $result->mastered, $result->weak);

            $target = $this->recovery->defaultTargetFor($student);
            if ($target !== null) {
                $this->recovery->generate($student, $target);
            }

            $test->update([
                'status' => DiagnosticTest::STATUS_COMPLETED,
                'estimated_level' => $result->estimatedLevel,
                'lo' => $result->frontierIndex,
                'completed_at' => now(),
            ]);
        });

        return $result;
    }

    public function isFinished(DiagnosticTest $test): bool
    {
        return $this->probeInFlight($test) === null
            && DiagnosticEngine::next($this->replay($test))->action === DiagnosticAction::Finish;
    }

    /* ------------------------------------------------------------------ internals */

    /**
     * Skills at or below the student's grade that we can actually ask about.
     *
     * A probe needs three questions at medium difficulty. Including a skill with no bank would let
     * the binary search land somewhere it cannot ask anything — the search space has to be what is
     * assessable, not what exists.
     *
     * @return list<string>
     */
    private function candidates(int $grade): array
    {
        $assessable = Question::query()
            ->where('difficulty', Difficulty::Medium->value)
            ->groupBy('skill_id')
            ->havingRaw('COUNT(*) >= ?', [DiagnosticEngine::PROBE_SIZE])
            ->pluck('skill_id')
            ->all();

        $codeOf = array_flip($this->graph->idLookup());

        $assessableCodes = array_flip(array_map(
            static fn (int $id): string => $codeOf[$id],
            array_filter($assessable, static fn (int $id): bool => isset($codeOf[$id])),
        ));

        return array_values(array_filter(
            $this->graph->candidatesForGrade($grade),
            static fn (string $code): bool => isset($assessableCodes[$code]),
        ));
    }

    /**
     * Folds the answer log into per-probe tallies.
     *
     * A plain array rather than a Collection: Collection's value template is invariant, so the
     * narrowed shape a filter produces will not satisfy the declared one, and the type would have
     * to be widened until it stopped saying anything.
     *
     * @return list<array{skill_code: string, correct: int, total: int, probe_step: int}>
     */
    private function probes(DiagnosticTest $test): array
    {
        $codeOf = array_flip($this->graph->idLookup());
        $byStep = [];

        foreach ($test->answers as $answer) {
            $step = $answer->probe_step;

            $byStep[$step] ??= [
                'skill_code' => $codeOf[$answer->skill_id],
                'correct' => 0,
                'total' => 0,
                'probe_step' => $step,
            ];

            $byStep[$step]['total']++;

            if ($answer->is_correct) {
                $byStep[$step]['correct']++;
            }
        }

        ksort($byStep);

        return array_values($byStep);
    }

    /** @return list<array{skill_code: string, correct: int, total: int, probe_step: int}> */
    private function completedProbes(DiagnosticTest $test): array
    {
        return array_values(array_filter(
            $this->probes($test),
            static fn (array $probe): bool => $probe['total'] >= DiagnosticEngine::PROBE_SIZE,
        ));
    }

    /**
     * The probe part-way through, if any. Only whole probes are evidence, so an unfinished one
     * stays out of the engine state entirely.
     *
     * @return array{skill_code: string, skill_id: int, probe_step: int}|null
     */
    private function probeInFlight(DiagnosticTest $test): ?array
    {
        foreach ($this->probes($test) as $probe) {
            if ($probe['total'] >= DiagnosticEngine::PROBE_SIZE) {
                continue;
            }

            return [
                'skill_code' => $probe['skill_code'],
                'skill_id' => $this->graph->idLookup()[$probe['skill_code']],
                'probe_step' => $probe['probe_step'],
            ];
        }

        return null;
    }

    /** Rebuilds the engine state by replaying every completed probe from the answer log. */
    private function replay(DiagnosticTest $test): DiagnosticState
    {
        $state = DiagnosticState::start($test->grade_at_start, $this->candidates($test->grade_at_start));

        foreach ($this->completedProbes($test) as $probe) {
            $state = $state->withProbe([
                'skill_code' => $probe['skill_code'],
                'correct' => $probe['correct'],
                'total' => DiagnosticEngine::PROBE_SIZE,
            ]);
        }

        return $state;
    }

    /** Writes the replayed bounds back as a cache, for resume and for the teacher's view. */
    private function persist(DiagnosticTest $test, DiagnosticState $state): void
    {
        $test->update(['lo' => $state->lo, 'hi' => $state->hi, 'asked' => $state->asked]);
    }

    /**
     * A medium-difficulty question on this skill that the sitting has not already used.
     *
     * Medium throughout: the diagnostic is locating a level, not stretching one. Varying difficulty
     * inside a probe would make the three answers measure different things.
     */
    private function pickQuestion(int $skillId, DiagnosticTest $test): ?Question
    {
        $asked = $test->answers->pluck('question_id')->all();

        return Question::query()
            ->where('skill_id', $skillId)
            ->where('difficulty', Difficulty::Medium->value)
            ->whereNotIn('id', $asked)
            ->with('options')
            ->inRandomOrder()
            ->first();
    }

    public function skillFor(string $code): Skill
    {
        return Skill::query()->where('code', $code)->firstOrFail();
    }
}
