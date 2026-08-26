<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Classroom;
use App\Models\User;
use App\Services\TeacherAnalyticsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

/**
 * The teacher's view of their own classes.
 *
 * Every route resolves the classroom through the signed-in teacher's own relation, so a teacher
 * can see everything about their students and literally nothing about anyone else's. Scoping by
 * ownership rather than by a permission check means a missing check cannot leak a class — the
 * query simply has nowhere to find it.
 */
final class TeacherController extends Controller
{
    public function __construct(private readonly TeacherAnalyticsService $analytics) {}

    public function classrooms(): JsonResponse
    {
        $teacher = $this->teacher();

        return response()->json([
            'classrooms' => $teacher->classrooms()
                ->withCount('students')
                ->orderBy('name')
                ->get(['id', 'name', 'join_code', 'grade'])
                ->all(),
        ]);
    }

    /**
     * Everything for one class in a single response.
     *
     * A teacher opens this once, often on a shared laptop with a few minutes of power, and needs
     * the whole picture. Four round trips to assemble one screen is four chances for the
     * connection to drop half way.
     */
    public function overview(int $classroomId): JsonResponse
    {
        $classroom = $this->classroom($classroomId);

        return response()->json([
            'classroom' => [
                'id' => $classroom->id,
                'name' => $classroom->name,
                'join_code' => $classroom->join_code,
                'grade' => $classroom->grade,
            ],
            'students' => $this->analytics->roster($classroom),
            'groups' => $this->analytics->smartGroups($classroom),
            'misconceptions' => $this->analytics->misconceptions($classroom),
            'interventions' => $this->analytics->interventions($classroom),
        ]);
    }

    private function classroom(int $id): Classroom
    {
        return $this->teacher()->classrooms()->findOrFail($id);
    }

    private function teacher(): User
    {
        $account = Auth::guard('sanctum')->user();

        abort_unless($account instanceof User && $account->isTeacher(), 403, 'هذه الواجهة للمعلّمين.');

        return $account;
    }
}
