<?php

declare(strict_types=1);

use App\Models\Classroom;
use App\Models\Question;
use App\Models\Skill;
use App\Models\Student;
use App\Models\User;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/**
 * The student journey over HTTP, as the PWA will actually drive it.
 */

/** @return array{0: Student, 1: string} the student and their bearer token */
function loginByCard(int $grade = 7): array
{
    $student = Student::factory()->grade($grade)->create();

    $response = test()->postJson('/api/auth/student', [
        'login_token' => $student->getRawOriginal('login_token'),
        'device_id' => (string) Str::uuid7(),
        'device_label' => 'هاتف العائلة',
    ]);

    $response->assertOk()->assertJsonStructure(['token', 'student' => ['id', 'display_name', 'grade']]);

    return [$student, $response->json('token')];
}

it('lets a child log in by holding up their printed card', function (): void {
    app(CurriculumSeeder::class)->run();

    [$student, $token] = loginByCard();

    test()->withToken($token)->getJson('/api/auth/me')
        ->assertOk()
        ->assertJsonPath('type', 'student')
        ->assertJsonPath('account.display_name', $student->display_name);

    // The card is registered as a device, because its per-device counter is what orders every
    // attempt recorded offline afterwards.
    expect($student->fresh()->last_seen_at)->not->toBeNull();
});

it('refuses an unknown card without hinting at what a valid one looks like', function (): void {
    test()->postJson('/api/auth/student', ['login_token' => str_repeat('x', 48)])
        ->assertStatus(422)
        ->assertJsonValidationErrors('login_token');
});

it('serves the class roster unauthenticated, and nothing beyond first names', function (): void {
    $classroom = Classroom::factory()->grade(6)->create(['name' => 'صف سادس']);
    Student::factory()->count(3)->inClassroom($classroom)->create();

    $response = test()->getJson("/api/auth/classrooms/{$classroom->join_code}")->assertOk();

    expect($response->json('students'))->toHaveCount(3);

    // Only id and display_name. No token, no PIN hash, nothing that is not already public in the
    // room — this endpoint has no auth in front of it, so the payload is the protection.
    expect(array_keys($response->json('students.0')))->toBe(['id', 'display_name']);
});

it('lets a student on a shared phone pick their name and tap a PIN', function (): void {
    $classroom = Classroom::factory()->grade(6)->create();
    $student = Student::factory()->inClassroom($classroom)->create(['pin_hash' => '4821']);

    test()->postJson('/api/auth/student', [
        'join_code' => $classroom->join_code,
        'student_id' => $student->id,
        'pin' => '4821',
    ])->assertOk()->assertJsonPath('student.id', $student->id);

    test()->postJson('/api/auth/student', [
        'join_code' => $classroom->join_code,
        'student_id' => $student->id,
        'pin' => '0000',
    ])->assertStatus(422)->assertJsonValidationErrors('pin');
});

it('hydrates the offline store in a single call', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard();

    $response = test()->withToken($token)->getJson('/api/student/bootstrap')->assertOk();

    expect($response->json('skills'))->toHaveCount(58)
        ->and($response->json('has_completed_diagnostic'))->toBeFalse();

    // Prerequisites travel as codes so the client can draw the graph without a second request,
    // and `depth` is precomputed so a five-year-old phone is not finding longest paths.
    $first = collect($response->json('skills'))->firstWhere('code', 'FRC.ADD.UNLIKE');
    expect($first['prerequisites'])->toContain('FRC.EQUIV')
        ->and($first)->toHaveKey('depth');

    // Deliberately absent: 510 questions would not finish downloading on 2G. Banks come per skill.
    expect($response->json())->not->toHaveKey('questions');
});

it('runs a whole diagnostic over the API and returns the verdict in the final response', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard(grade: 7);

    $ceiling = Skill::query()->where('code', 'OPS.DIV.LONG')->value('order_index');

    $response = test()->withToken($token)->postJson('/api/diagnostic/start')->assertOk();
    $question = $response->json('question');

    $guard = 0;
    while ($question !== null && $guard++ < 30) {
        $skill = Skill::query()->where('code', $question['skill_code'])->firstOrFail();
        $knowsIt = $skill->order_index <= $ceiling;

        $option = collect($question['options'])->firstWhere('is_correct', $knowsIt);

        $response = test()->withToken($token)->postJson('/api/diagnostic/answer', [
            'question_id' => $question['id'],
            'option_id' => $option['id'],
        ])->assertOk();

        $question = $response->json('question');
    }

    // The verdict arrives with the last answer, not after another round trip.
    $response->assertJsonPath('finished', true)
        ->assertJsonStructure(['result' => ['estimated_level', 'mastered', 'weak', 'missing']]);

    expect($response->json('result.estimated_level'))->toBeLessThan(7);

    // And the recovery path is already waiting.
    $path = test()->withToken($token)->getJson('/api/student/learning-path')->assertOk();
    expect($path->json('items'))->not->toBeEmpty()
        ->and($path->json('current_skill_code'))->not->toBeNull();
});

it('rejects an option that belongs to a different question', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard();

    test()->withToken($token)->postJson('/api/diagnostic/start');

    $questions = Question::query()->with('options')->take(2)->get();

    test()->withToken($token)->postJson('/api/diagnostic/answer', [
        'question_id' => $questions[0]->id,
        'option_id' => $questions[1]->options->first()->id,
    ])->assertStatus(422)->assertJsonValidationErrors('option_id');
});

it('hands over a skill bank whole, so practice survives losing the connection', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard();

    $response = test()->withToken($token)->getJson('/api/skills/FRC.ADD.UNLIKE/bank')->assertOk();

    expect($response->json('questions'))->toHaveCount(30)
        ->and($response->json('skill.code'))->toBe('FRC.ADD.UNLIKE');

    // The client grades offline, so it needs the answer and the explanation up front.
    $first = $response->json('questions.0');
    expect($first)->toHaveKeys(['stem_ar', 'expression', 'hint_ar', 'explanation_ar', 'options'])
        ->and($first['options'][0])->toHaveKey('is_correct');
});

/**
 * The feature the teacher dashboard is built on, seen from the student side: choosing the
 * distractor that adds numerators and denominators comes back named, with what to do about it.
 */
it('names the misconception behind a wrong answer', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard(grade: 6);

    $question = Question::query()
        ->whereHas('skill', fn ($q) => $q->where('code', 'FRC.ADD.UNLIKE'))
        ->whereHas('options', fn ($q) => $q->whereNotNull('misconception_id'))
        ->with('options.misconception')
        ->firstOrFail();

    $trap = $question->options->firstWhere(fn ($o) => $o->misconception_id !== null);

    $response = test()->withToken($token)->postJson('/api/exercises/answer', [
        'question_id' => $question->id,
        'option_id' => $trap->id,
        'client_seq' => 1,
    ])->assertOk();

    expect($response->json('is_correct'))->toBeFalse()
        ->and($response->json('misconception.name_ar'))->toBe($trap->misconception->name_ar)
        ->and($response->json('misconception.remediation_ar'))->not->toBeEmpty()
        ->and($response->json('explanation_ar'))->not->toBeEmpty();
});

it('routes a stuck student to the prerequisite instead of the same wall', function (): void {
    app(CurriculumSeeder::class)->run();
    [, $token] = loginByCard(grade: 6);

    $response = null;
    for ($i = 0; $i < 3; $i++) {
        $next = test()->withToken($token)->getJson('/api/skills/FRC.ADD.UNLIKE/next')->assertOk();
        $question = $next->json('question');
        $wrong = collect($question['options'])->firstWhere('is_correct', false);

        $response = test()->withToken($token)->postJson('/api/exercises/answer', [
            'question_id' => $question['id'],
            'option_id' => $wrong['id'],
            'client_seq' => $i + 1,
        ])->assertOk();
    }

    $response->assertJsonPath('action', 'route_to_prerequisite');
    expect($response->json('route_to.skill_code'))->not->toBeNull();
});

it('keeps a teacher out of the student endpoints', function (): void {
    app(CurriculumSeeder::class)->run();

    $teacher = User::factory()->teacher()->create(['password' => 'secret-pass']);

    $token = test()->postJson('/api/auth/teacher', [
        'email' => $teacher->email,
        'password' => 'secret-pass',
    ])->assertOk()->json('token');

    test()->withToken($token)->getJson('/api/student/bootstrap')->assertStatus(403);
});

it('does not reveal whether an email has an account', function (): void {
    User::factory()->teacher()->create(['email' => 'known@nabd.test', 'password' => 'secret-pass']);

    $known = test()->postJson('/api/auth/teacher', ['email' => 'known@nabd.test', 'password' => 'wrong']);
    $unknown = test()->postJson('/api/auth/teacher', ['email' => 'nobody@nabd.test', 'password' => 'wrong']);

    $known->assertStatus(422);
    $unknown->assertStatus(422);
    expect($known->json('errors'))->toBe($unknown->json('errors'));
});

it('requires a token for everything past login', function (): void {
    test()->getJson('/api/student/bootstrap')->assertStatus(401);
    test()->postJson('/api/diagnostic/start')->assertStatus(401);
    test()->postJson('/api/exercises/answer')->assertStatus(401);
});
