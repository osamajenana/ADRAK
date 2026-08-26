<?php

declare(strict_types=1);

namespace App\Services;

use App\Engine\MasteryStatus;
use App\Engine\RecoveryPathEngine;
use App\Models\LearningPath;
use App\Models\LearningPathItem;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use Illuminate\Support\Facades\DB;

/**
 * Turns "this student is three years behind" into an ordered list of skills to rebuild.
 *
 * The list starts at the student's real first gap, not at their grade. That is the whole
 * intervention: a ninth-grader who cannot divide is not helped by ninth-grade material, however
 * well it is delivered.
 */
final class RecoveryPathService
{
    public function __construct(private readonly SkillGraphService $graph) {}

    /**
     * Rebuilds the active path toward a target skill.
     *
     * Regenerated wholesale rather than patched: after a sync the student's mastery may have moved
     * in several places at once, and a path edited step by step would keep stale ordering from a
     * state that no longer exists.
     */
    public function generate(Student $student, Skill $target): LearningPath
    {
        // ->value explicitly: Eloquent's pluck applies the model's casts even through a join, so
        // this arrives as MasteryStatus enums. The engine is pure and compares plain strings, and
        // an enum silently failing every !== check would leave mastered skills on the path.
        $statuses = StudentSkill::query()
            ->where('student_id', $student->id)
            ->join('skills', 'skills.id', '=', 'student_skills.skill_id')
            ->pluck('student_skills.status', 'skills.code')
            ->map(static fn (MasteryStatus $status): string => $status->value)
            ->all();

        $codes = RecoveryPathEngine::build($this->graph->all(), $statuses, $target->code);
        $skillIds = $this->graph->idLookup();

        return DB::transaction(function () use ($student, $target, $codes, $skillIds): LearningPath {
            LearningPath::query()
                ->where('student_id', $student->id)
                ->where('is_active', true)
                ->update(['is_active' => false]);

            $path = LearningPath::create([
                'student_id' => $student->id,
                'target_skill_id' => $target->id,
                'is_active' => true,
            ]);

            $rows = [];
            foreach ($codes as $index => $code) {
                $rows[] = [
                    'learning_path_id' => $path->id,
                    'skill_id' => $skillIds[$code],
                    'order_index' => $index,
                    // Only the first step opens. Showing a child eleven unlocked skills at once is
                    // the same overwhelm that made the gap in the first place; showing them one is
                    // a thing they can finish today.
                    'status' => $index === 0
                        ? LearningPathItem::STATUS_CURRENT
                        : LearningPathItem::STATUS_LOCKED,
                ];
            }

            foreach (array_chunk($rows, 200) as $chunk) {
                LearningPathItem::insert($chunk);
            }

            return $path->load('items.skill');
        });
    }

    /**
     * Where the student is aiming when nobody has said otherwise: the furthest spine skill their
     * grade is expected to reach.
     *
     * The spine is the arithmetic-to-algebra backbone where learning loss actually bites. Aiming at
     * a peripheral skill would produce a path that misses the gap entirely.
     */
    public function defaultTargetFor(Student $student): ?Skill
    {
        return Skill::query()
            ->where('grade_level', '<=', $student->grade)
            ->where('is_spine', true)
            ->orderByDesc('order_index')
            ->first();
    }

    /** Regenerates the active path against current mastery, keeping the same target. */
    public function refresh(Student $student): ?LearningPath
    {
        $active = LearningPath::query()
            ->where('student_id', $student->id)
            ->where('is_active', true)
            ->first();

        $target = $active === null
            ? $this->defaultTargetFor($student)
            : $active->targetSkill;

        return $target === null ? null : $this->generate($student, $target);
    }

    /** The skill the student should be working on right now, or null when the path is complete. */
    public function currentSkill(Student $student): ?Skill
    {
        $item = LearningPathItem::query()
            ->whereHas('learningPath', fn ($q) => $q->where('student_id', $student->id)->where('is_active', true))
            ->where('status', '!=', LearningPathItem::STATUS_DONE)
            ->orderBy('order_index')
            ->with('skill')
            ->first();

        return $item?->skill;
    }

    /** @return array<string, MasteryStatus> code => status, for skills the student has touched */
    public function statusesByCode(Student $student): array
    {
        // Already MasteryStatus instances — the cast is applied by pluck.
        return StudentSkill::query()
            ->where('student_id', $student->id)
            ->join('skills', 'skills.id', '=', 'student_skills.skill_id')
            ->pluck('student_skills.status', 'skills.code')
            ->all();
    }
}
