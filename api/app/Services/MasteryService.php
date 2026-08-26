<?php

declare(strict_types=1);

namespace App\Services;

use App\Engine\MasteryEngine;
use App\Engine\MasteryStatus;
use App\Engine\ReviewEngine;
use App\Models\ExerciseAttempt;
use App\Models\LearningPathItem;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Keeps student_skills in step with the attempt log.
 *
 * Every column on student_skills is derived, never authored. This service is the only thing that
 * writes them, and it always recomputes from the full attempt history rather than adjusting the
 * stored figure — because the same attempts arrive out of order, twice, and days late through the
 * three sync channels, and an incrementally-updated aggregate would drift a little further apart
 * from the truth with every one of those.
 */
final class MasteryService
{
    /**
     * Recomputes one skill from its attempts and returns the stored row.
     *
     * @param  bool  $unlockDependents  false while replaying a sync batch, so unlocking runs once
     *                                  at the end instead of after every event in the batch
     */
    public function recompute(Student $student, Skill $skill, bool $unlockDependents = true): StudentSkill
    {
        $attempts = ExerciseAttempt::query()
            ->where('student_id', $student->id)
            ->where('skill_id', $skill->id)
            // (client_seq, id): the per-device counter first, the server's arrival order to break
            // ties between devices. Never a client timestamp — see the attempts migration.
            ->orderBy('client_seq')
            ->orderBy('id')
            ->get();

        $result = MasteryEngine::evaluate(
            $attempts->map(fn (ExerciseAttempt $a) => $a->toEngineAttempt())->all(),
            $skill->mastery_threshold,
        );

        $studentSkill = StudentSkill::query()->firstOrNew([
            'student_id' => $student->id,
            'skill_id' => $skill->id,
        ]);

        $wasMastered = $studentSkill->status === MasteryStatus::Mastered;
        $nowMastered = $result->status === MasteryStatus::Mastered;

        $studentSkill->fill([
            'mastery_score' => $result->score,
            'attempts' => $result->attempts,
            'correct_answers' => $result->correct,
            'hard_correct' => $result->hardCorrect,
            'status' => $result->status,
        ]);

        if ($nowMastered && ! $wasMastered) {
            $masteredAt = now();
            $studentSkill->mastered_at = $masteredAt;
            // The engine speaks unix seconds because it must be clock-free and replayable;
            // the conversion to a date belongs here, at the edge, not inside a cast.
            $studentSkill->next_review_at = Carbon::createFromTimestamp(
                ReviewEngine::nextReviewAt($masteredAt->getTimestamp(), $studentSkill->review_count),
            );
        }

        // Mastery can be lost. A skill that decays back below the threshold on later attempts
        // returns to `learning` — but the review schedule is left alone, because the point of the
        // review was to catch exactly this.
        $studentSkill->save();

        if ($nowMastered && ! $wasMastered) {
            $this->markPathItemDone($student, $skill);

            if ($unlockDependents) {
                $this->unlockDependents($student, $skill);
            }
        }

        return $studentSkill;
    }

    /**
     * Opens up the skills this one was blocking — but only those whose OTHER prerequisites the
     * student already holds. A skill with two foundations is not ready when one of them lands.
     */
    public function unlockDependents(Student $student, Skill $skill): void
    {
        $mastered = StudentSkill::query()
            ->where('student_id', $student->id)
            ->where('status', MasteryStatus::Mastered->value)
            ->pluck('skill_id')
            ->all();

        $dependents = $skill->dependents()->with('prerequisites:id')->get();

        foreach ($dependents as $dependent) {
            $missing = $dependent->prerequisites
                ->pluck('id')
                ->diff($mastered);

            if ($missing->isNotEmpty()) {
                continue;
            }

            LearningPathItem::query()
                ->whereHas('learningPath', fn ($q) => $q->where('student_id', $student->id)->where('is_active', true))
                ->where('skill_id', $dependent->id)
                ->where('status', LearningPathItem::STATUS_LOCKED)
                ->update(['status' => LearningPathItem::STATUS_CURRENT]);
        }
    }

    private function markPathItemDone(Student $student, Skill $skill): void
    {
        LearningPathItem::query()
            ->whereHas('learningPath', fn ($q) => $q->where('student_id', $student->id)->where('is_active', true))
            ->where('skill_id', $skill->id)
            ->update(['status' => LearningPathItem::STATUS_DONE]);
    }

    /**
     * Seeds student_skills for a whole diagnostic result in one pass.
     *
     * The diagnostic infers mastery of skills below the frontier that were never probed, so those
     * rows carry status but no attempts — and `mastery_score` stays 0 on purpose. Nothing was
     * measured, and writing a score would dress an inference up as evidence on the teacher's screen.
     *
     * @param  list<string>  $masteredCodes
     * @param  list<string>  $weakCodes
     */
    public function applyDiagnostic(Student $student, array $masteredCodes, array $weakCodes): void
    {
        $codes = [...$masteredCodes, ...$weakCodes];
        $skillIds = Skill::query()->whereIn('code', $codes)->pluck('id', 'code');

        $rows = [];
        $now = now();

        foreach ($masteredCodes as $code) {
            $rows[] = [
                'student_id' => $student->id,
                'skill_id' => $skillIds[$code],
                'status' => MasteryStatus::Mastered->value,
                'mastered_at' => $now,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        foreach ($weakCodes as $code) {
            $rows[] = [
                'student_id' => $student->id,
                'skill_id' => $skillIds[$code],
                'status' => MasteryStatus::Learning->value,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }

        if ($rows === []) {
            return;
        }

        DB::transaction(function () use ($rows): void {
            foreach (array_chunk($rows, 200) as $chunk) {
                StudentSkill::query()->upsert(
                    $chunk,
                    ['student_id', 'skill_id'],
                    ['status', 'mastered_at', 'updated_at'],
                );
            }
        });
    }
}
