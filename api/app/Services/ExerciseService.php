<?php

declare(strict_types=1);

namespace App\Services;

use App\Engine\Difficulty;
use App\Engine\DifficultyAction;
use App\Engine\DifficultyDecision;
use App\Engine\DifficultyEngine;
use App\Engine\EloEngine;
use App\Models\ExerciseAttempt;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use Illuminate\Support\Facades\DB;

/**
 * Serves practice on one skill and records what came back.
 *
 * Like everything else here, the adaptive state is DERIVED rather than stored: the current
 * difficulty and the streak counters are recomputed by replaying the attempt log through
 * DifficultyEngine. That costs a few dozen iterations and buys the property that matters — a
 * student who answers five questions offline, syncs, and picks up on a borrowed phone resumes at
 * exactly the difficulty they earned, with no stored counter to get out of step.
 */
final class ExerciseService
{
    public function __construct(
        private readonly MasteryService $mastery,
        private readonly RecoveryPathService $recovery,
    ) {}

    /**
     * Replays the attempt log to find where the student currently stands on this skill.
     *
     * Starts at `easy`. A child who has been told for two years that they are behind should meet a
     * question they can answer first; the two-correct promotion reaches medium within a minute.
     */
    public function currentDecision(Student $student, Skill $skill): DifficultyDecision
    {
        $attempts = ExerciseAttempt::query()
            ->where('student_id', $student->id)
            ->where('skill_id', $skill->id)
            ->orderBy('client_seq')
            ->orderBy('id')
            ->get(['is_correct']);

        $decision = new DifficultyDecision(Difficulty::Easy, DifficultyAction::Stay, 0, 0);

        foreach ($attempts as $attempt) {
            $decision = $this->advance($decision, (bool) $attempt->is_correct);
        }

        return $decision;
    }

    /** Applies one answer to the running difficulty state. */
    private function advance(DifficultyDecision $current, bool $correct): DifficultyDecision
    {
        $right = $correct ? $current->consecutiveCorrect + 1 : 0;
        $wrong = $correct ? 0 : $current->consecutiveWrong + 1;

        return DifficultyEngine::next($current->difficulty, $right, $wrong);
    }

    /**
     * Picks the next question: right skill, right difficulty, not one they just saw.
     *
     * Among the candidates it prefers the item whose calibrated Elo sits closest to the student's
     * ability on this skill — a question that is a coin flip for them teaches more than one they
     * were always going to get right or always going to miss.
     */
    public function nextQuestion(Student $student, Skill $skill, ?Difficulty $difficulty = null): ?Question
    {
        $difficulty ??= $this->currentDecision($student, $skill)->difficulty;

        $recentlySeen = ExerciseAttempt::query()
            ->where('student_id', $student->id)
            ->where('skill_id', $skill->id)
            ->orderByDesc('id')
            ->limit(8)
            ->pluck('question_id')
            ->all();

        $theta = (float) (StudentSkill::query()
            ->where('student_id', $student->id)
            ->where('skill_id', $skill->id)
            ->value('theta') ?? 1200);

        $pool = Question::query()
            ->where('skill_id', $skill->id)
            ->where('difficulty', $difficulty->value)
            ->whereNotIn('id', $recentlySeen)
            ->with('options')
            ->get();

        // Everything at this level has been seen recently: reuse rather than refuse. A blank screen
        // is a worse answer than a repeat.
        if ($pool->isEmpty()) {
            $pool = Question::query()
                ->where('skill_id', $skill->id)
                ->where('difficulty', $difficulty->value)
                ->with('options')
                ->get();
        }

        return $pool->sortBy(fn (Question $q): float => abs($q->difficulty_elo - $theta))->first();
    }

    /**
     * Records one answer and returns everything the client needs to render feedback.
     *
     * @param  array{device_id?: string|null, client_seq?: int, client_created_at?: int|null}  $meta
     * @return array{
     *     attempt: ExerciseAttempt,
     *     is_correct: bool,
     *     explanation_ar: string|null,
     *     misconception: array{name_ar: string, remediation_ar: string}|null,
     *     decision: DifficultyDecision,
     *     student_skill: StudentSkill,
     * }
     */
    public function submit(Student $student, Question $question, ?QuestionOption $option, array $meta = []): array
    {
        $skill = $question->skill;
        $isCorrect = (bool) $option?->is_correct;

        return DB::transaction(function () use ($student, $question, $option, $skill, $isCorrect, $meta): array {
            $before = $this->currentDecision($student, $skill);

            $attempt = ExerciseAttempt::create([
                'student_id' => $student->id,
                'question_id' => $question->id,
                'skill_id' => $skill->id,
                'selected_option_id' => $option?->id,
                'is_correct' => $isCorrect,
                'difficulty_at_attempt' => $question->difficulty,
                // Denormalised so the teacher's misconception tiles are one indexed scan rather
                // than a four-table join per tile.
                'misconception_id' => $option?->misconception_id,
                'device_id' => $meta['device_id'] ?? null,
                'client_seq' => $meta['client_seq'] ?? 0,
                'client_created_at' => $meta['client_created_at'] ?? null,
            ]);

            $studentSkill = $this->mastery->recompute($student, $skill);
            $this->calibrate($question, $studentSkill, $isCorrect);

            $decision = $this->advance($before, $isCorrect);

            $misconception = $option?->misconception;

            return [
                'attempt' => $attempt,
                'is_correct' => $isCorrect,
                'explanation_ar' => $question->explanation_ar,
                'misconception' => $misconception === null ? null : [
                    'name_ar' => $misconception->name_ar,
                    'remediation_ar' => $misconception->remediation_ar,
                ],
                'decision' => $decision,
                'student_skill' => $studentSkill->refresh(),
            ];
        });
    }

    /**
     * Nudges both ratings after an answer.
     *
     * This only ever changes which question comes next. Mastery is decided by MasteryEngine and
     * nothing else, so a badly calibrated item can waste a student's minute — it can never tell
     * them they have mastered something they have not.
     */
    private function calibrate(Question $question, StudentSkill $studentSkill, bool $correct): void
    {
        $updated = EloEngine::update(
            (float) $studentSkill->theta,
            (float) $question->difficulty_elo,
            $correct,
        );

        $studentSkill->update(['theta' => $updated['theta']]);
        $question->update(['difficulty_elo' => $updated['item_elo']]);
    }

    /**
     * Where the student goes when three wrong answers at `easy` say the gap is below this skill.
     *
     * Returns the deepest unmastered prerequisite — the foundation, not the step just behind. A
     * student failing division usually needs multiplication facts, not division again more slowly.
     */
    public function prerequisiteFor(Student $student, Skill $skill): ?Skill
    {
        $statuses = $this->recovery->statusesByCode($student);

        return $skill->prerequisites()
            ->orderByDesc('order_index')
            ->get()
            ->first(fn (Skill $prerequisite): bool => ($statuses[$prerequisite->code] ?? null)?->value !== 'mastered');
    }
}
