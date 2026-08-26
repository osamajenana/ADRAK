<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Engine\MasteryStatus;
use App\Http\Controllers\Concerns\ResolvesStudent;
use App\Http\Controllers\Controller;
use App\Http\Resources\SkillResource;
use App\Models\LearningPathItem;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use App\Services\RecoveryPathService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class StudentController extends Controller
{
    use ResolvesStudent;

    public function __construct(private readonly RecoveryPathService $recovery) {}

    /**
     * Everything the PWA needs to run with the network off, in one response.
     *
     * One call rather than five, because each round trip on 2G is measured in seconds and because
     * this is the moment the app decides whether it can work offline at all. The client writes the
     * whole payload into IndexedDB and does not need the server again until it has something to
     * sync back.
     *
     * Questions are NOT included: 510 items would blow the payload past anything a 2G connection
     * will finish. They are fetched per skill, as the path reaches them.
     */
    public function bootstrap(Request $request): JsonResponse
    {
        $student = $this->student();

        $skills = Skill::query()
            ->with('prerequisites:id,code')
            ->orderBy('order_index')
            ->get();

        $statuses = StudentSkill::query()
            ->where('student_id', $student->id)
            ->join('skills', 'skills.id', '=', 'student_skills.skill_id')
            ->get(['skills.code as code', 'student_skills.status', 'student_skills.mastery_score'])
            ->keyBy('code')
            ->map(static fn ($row): array => [
                'status' => $row->status->value,
                'mastery_score' => (float) $row->mastery_score,
            ])
            ->all();

        return response()->json([
            'student' => [
                'id' => $student->id,
                'display_name' => $student->display_name,
                'grade' => $student->grade,
            ],
            'skills' => SkillResource::collection($skills),
            'progress' => $statuses,
            'learning_path' => $this->pathPayload($student),
            'has_completed_diagnostic' => $student->diagnosticTests()
                ->where('status', 'completed')
                ->exists(),
        ]);
    }

    /**
     * The Skill Map: every skill with the student's standing on it.
     *
     * `depth` travels with each skill so the client can lay the graph out in columns without
     * recomputing longest paths across 58 nodes on a five-year-old phone.
     */
    public function skillMap(Request $request): JsonResponse
    {
        $student = $this->student();

        $statuses = StudentSkill::query()
            ->where('student_id', $student->id)
            ->join('skills', 'skills.id', '=', 'student_skills.skill_id')
            // pluck applies the model cast even through a join, so these are MasteryStatus.
            ->pluck('student_skills.status', 'skills.code')
            ->map(static fn (MasteryStatus $status): string => $status->value)
            ->all();

        $skills = Skill::query()
            ->with('prerequisites:id,code')
            ->orderBy('order_index')
            ->get();

        return response()->json([
            'skills' => $skills->map(fn (Skill $skill): array => [
                ...(new SkillResource($skill))->toArray($request),
                'status' => $statuses[$skill->code] ?? MasteryStatus::NotStarted->value,
            ])->all(),
            'summary' => [
                'mastered' => count(array_filter($statuses, static fn (string $s): bool => $s === 'mastered')),
                'learning' => count(array_filter($statuses, static fn (string $s): bool => $s === 'learning')),
                'total' => $skills->count(),
            ],
        ]);
    }

    public function learningPath(Request $request): JsonResponse
    {
        return response()->json($this->pathPayload($this->student()));
    }

    /** @return array<string, mixed>|null */
    private function pathPayload(Student $student): ?array
    {
        $path = $student->learningPaths()
            ->where('is_active', true)
            ->with(['items.skill', 'targetSkill'])
            ->first();

        if ($path === null) {
            return null;
        }

        return [
            'id' => $path->id,
            'target_skill_code' => $path->targetSkill?->code,
            'current_skill_code' => $this->recovery->currentSkill($student)?->code,
            'items' => $path->items->map(static fn (LearningPathItem $item): array => [
                'skill_code' => $item->skill->code,
                'name_ar' => $item->skill->name_ar,
                'order_index' => $item->order_index,
                'status' => $item->status,
            ])->all(),
        ];
    }
}
