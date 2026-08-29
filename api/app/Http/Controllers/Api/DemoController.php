<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\ValidationException;

/**
 * One tap into the demo classroom.
 *
 * The reasoning is uncomfortable but true: the best thing about this product cannot be seen from a
 * login screen, and someone working through thirty submissions will not type a class code off a
 * slide to find out. So the friction is removed entirely — and what they land in is a real account
 * with real seeded work, not a mock. There is no demo mode inside the app; a judge sees exactly
 * what a student sees.
 *
 * Gated on ADRAK_DEMO_MODE and refused outright otherwise. On a deployment holding real children's
 * work, an endpoint that issues tokens without credentials has no business existing.
 */
final class DemoController extends Controller
{
    public function student(): JsonResponse
    {
        $this->guard();

        // The student with the shared misconception: the account whose dashboard shows the thing
        // worth seeing, rather than an empty one.
        $student = Student::query()
            ->where('display_name', 'جنى')
            ->firstOr(fn () => Student::query()->firstOrFail());

        return response()->json([
            'token' => $student->createToken('demo')->plainTextToken,
            'student' => [
                'id' => $student->id,
                'display_name' => $student->display_name,
                'grade' => $student->grade,
                'classroom_id' => $student->classroom_id,
            ],
        ]);
    }

    public function teacher(): JsonResponse
    {
        $this->guard();

        $teacher = User::query()->where('email', DemoSeeder::TEACHER_EMAIL)->firstOrFail();

        return response()->json([
            'token' => $teacher->createToken('demo')->plainTextToken,
            'user' => ['name' => $teacher->name, 'role' => $teacher->role->value],
        ]);
    }

    private function guard(): void
    {
        if (config('adrak.demo.enabled') !== true) {
            throw ValidationException::withMessages(['demo' => 'وضع العرض غير مفعّل.']);
        }
    }
}
