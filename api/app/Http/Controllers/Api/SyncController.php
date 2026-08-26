<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Concerns\ResolvesStudent;
use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\StudentSkill;
use App\Models\SyncEvent;
use App\Models\User;
use App\Services\SyncService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * Where work recorded offline comes back.
 *
 * Two doors into the same ingest, because a student's progress has to survive the case where the
 * student never gets a connection at all:
 *
 *   /sync        the student's own device, when it finds a signal.
 *   /sync/relay  their teacher, uploading a batch collected in the room — scanned off screens as
 *                QR codes, or handed over as a file — from a device that did get online.
 *
 * Both are idempotent, so a student whose work arrives by BOTH routes is not counted twice. That is
 * not a nicety: in a class where some phones have data and some do not, both paths firing for the
 * same child is the normal case.
 */
final class SyncController extends Controller
{
    use ResolvesStudent;

    private const MAX_EVENTS_PER_BATCH = 500;

    public function __construct(private readonly SyncService $sync) {}

    public function push(Request $request): JsonResponse
    {
        $validated = $request->validate($this->rules());
        $student = $this->student();

        $result = $this->sync->ingest(
            $student,
            $validated['device_id'],
            $validated['events'],
            SyncEvent::CHANNEL_CLOUD,
        );

        return response()->json([...$result, 'state' => $this->canonicalState($student)]);
    }

    /**
     * A teacher uploading on a student's behalf.
     *
     * Scoped to their own classrooms — a teacher can carry a child's work to the server, and can do
     * nothing at all with a child who is not theirs.
     */
    public function relay(Request $request): JsonResponse
    {
        $teacher = Auth::guard('sanctum')->user();

        abort_unless($teacher instanceof User && $teacher->isTeacher(), 403, 'هذه الواجهة للمعلّمين.');

        $validated = $request->validate([
            ...$this->rules(),
            'student_id' => ['required', 'integer', 'exists:students,id'],
            'channel' => ['nullable', 'in:qr,file'],
        ]);

        $student = Student::query()
            ->whereIn('classroom_id', $teacher->classrooms()->select('id'))
            ->findOrFail($validated['student_id']);

        $result = $this->sync->ingest(
            $student,
            $validated['device_id'],
            $validated['events'],
            $validated['channel'] ?? SyncEvent::CHANNEL_QR,
        );

        return response()->json([...$result, 'student_id' => $student->id]);
    }

    /** @return array<string, mixed> */
    private function rules(): array
    {
        return [
            'device_id' => ['required', 'uuid'],
            // Capped so one device cannot hold a transaction open long enough to stall a class
            // syncing at the same moment. The client sends the rest in the next batch.
            'events' => ['required', 'array', 'max:'.self::MAX_EVENTS_PER_BATCH],
            'events.*.id' => ['required', 'uuid'],
            'events.*.client_seq' => ['required', 'integer', 'min:0'],
            'events.*.type' => ['required', 'string', 'max:32'],
            'events.*.payload' => ['required', 'array'],
            'events.*.client_created_at' => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * What the server now believes, returned with every sync.
     *
     * The client replaces its own derived state with this rather than trying to merge. Both sides
     * compute mastery from the same rules over the same log, so they agree — and when they cannot
     * (an event the server dropped because its question no longer exists), the server's answer is
     * the one that matches what the teacher will see.
     *
     * @return array{progress: object, learning_path: array<string, mixed>|null}
     */
    private function canonicalState(Student $student): array
    {
        $progress = StudentSkill::query()
            ->where('student_id', $student->id)
            ->join('skills', 'skills.id', '=', 'student_skills.skill_id')
            ->get(['skills.code as code', 'student_skills.status', 'student_skills.mastery_score'])
            ->keyBy('code')
            ->map(static fn ($row): array => [
                'status' => $row->status->value,
                'mastery_score' => (float) $row->mastery_score,
            ])
            ->all();

        $path = $student->learningPaths()
            ->where('is_active', true)
            ->with(['items.skill', 'targetSkill'])
            ->first();

        return [
            // Cast for the same reason as /student/bootstrap: PHP serialises an empty map as [].
            'progress' => (object) $progress,
            'learning_path' => $path === null ? null : [
                'target_skill_code' => $path->targetSkill?->code,
                'items' => $path->items->map(static fn ($item): array => [
                    'skill_code' => $item->skill->code,
                    'name_ar' => $item->skill->name_ar,
                    'order_index' => $item->order_index,
                    'status' => $item->status,
                ])->all(),
            ],
        ];
    }
}
