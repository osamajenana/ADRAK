<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StudentLoginRequest;
use App\Http\Requests\TeacherLoginRequest;
use App\Models\Classroom;
use App\Models\Device;
use App\Models\Student;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Tokens rather than session cookies, for both roles.
 *
 * A session cookie needs a live request to establish and refresh. The student app has to open, run
 * a diagnostic and record a week of practice with the network off, so it holds a long-lived token
 * in IndexedDB and syncs when it can. Sanctum's tokenable is polymorphic, so staff and students use
 * the same mechanism despite being different models.
 */
final class AuthController extends Controller
{
    /**
     * The roster behind a class code, for the shared-device picker.
     *
     * Deliberately unauthenticated, and deliberately thin: first names and ids, nothing else. The
     * roster is already public in the room — it is read aloud every morning — and the response
     * carries nothing that is not. Requiring credentials to see it would mean a child cannot reach
     * the login screen without already being logged in.
     */
    public function roster(string $joinCode): JsonResponse
    {
        $classroom = Classroom::query()
            ->where('join_code', Str::upper($joinCode))
            ->firstOrFail();

        return response()->json([
            'classroom' => [
                'name' => $classroom->name,
                'grade' => $classroom->grade,
            ],
            'students' => $classroom->students()
                ->orderBy('display_name')
                ->get(['id', 'display_name'])
                ->all(),
        ]);
    }

    public function student(StudentLoginRequest $request): JsonResponse
    {
        $student = $request->usesQrCard()
            ? $this->byCard($request->string('login_token')->value())
            : $this->byRoster($request);

        $student->forceFill(['last_seen_at' => now()])->save();

        $device = $this->registerDevice($request, $student);

        return response()->json([
            'token' => $student->createToken('student')->plainTextToken,
            'student' => [
                'id' => $student->id,
                'display_name' => $student->display_name,
                'grade' => $student->grade,
                'classroom_id' => $student->classroom_id,
            ],
            'device_id' => $device?->id,
        ]);
    }

    public function teacher(TeacherLoginRequest $request): JsonResponse
    {
        $user = User::query()->where('email', $request->string('email'))->first();

        if ($user === null || ! Hash::check($request->string('password')->value(), $user->password)) {
            // One message for both cases, so the response cannot be used to discover which
            // teachers have accounts.
            throw ValidationException::withMessages([
                'email' => 'بيانات الدخول غير صحيحة.',
            ]);
        }

        return response()->json([
            'token' => $user->createToken('staff')->plainTextToken,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role' => $user->role->value,
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        // Through the guard, not $request->user(): Sanctum's tokenable is polymorphic here, while
        // $request->user() is documented as returning the one configured auth model.
        $account = Auth::guard('sanctum')->user();

        return response()->json([
            'type' => $account instanceof Student ? 'student' : 'staff',
            'account' => $account,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    /* ------------------------------------------------------------------ internals */

    private function byCard(string $token): Student
    {
        $student = Student::query()->where('login_token', $token)->first();

        if ($student === null) {
            throw ValidationException::withMessages([
                'login_token' => 'هذه البطاقة غير معروفة. اطلب من معلّمك بطاقة جديدة.',
            ]);
        }

        return $student;
    }

    private function byRoster(StudentLoginRequest $request): Student
    {
        $classroom = Classroom::query()
            ->where('join_code', Str::upper($request->string('join_code')->value()))
            ->first();

        $student = $classroom?->students()->find($request->integer('student_id'));

        if ($student === null || ! Hash::check($request->string('pin')->value(), (string) $student->pin_hash)) {
            throw ValidationException::withMessages([
                'pin' => 'الرقم السري غير صحيح.',
            ]);
        }

        return $student;
    }

    /**
     * Registers the phone or tablet this login came from.
     *
     * The device id is minted by the client and stays in IndexedDB, because it is what stamps every
     * offline attempt with a per-device sequence — the ordering the whole sync design rests on. The
     * server records it rather than issuing it, so a device that has been working offline for a
     * week already has the id it used.
     */
    private function registerDevice(StudentLoginRequest $request, Student $student): ?Device
    {
        $deviceId = $request->string('device_id')->value();

        if ($deviceId === '') {
            return null;
        }

        $device = Device::query()->find($deviceId) ?? new Device(['id' => $deviceId]);

        $device->fill([
            'student_id' => $student->id,
            'label' => $request->string('device_label')->value() ?: $device->label,
            'last_seen_at' => now(),
        ])->save();

        return $device;
    }
}
