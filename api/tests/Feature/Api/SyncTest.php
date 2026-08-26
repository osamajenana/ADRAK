<?php

declare(strict_types=1);

use App\Models\Classroom;
use App\Models\ExerciseAttempt;
use App\Models\Question;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use App\Models\SyncEvent;
use App\Models\User;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;
use Tests\TestCase;

uses(RefreshDatabase::class);

/**
 * Where a week of offline work comes back.
 *
 * The property everything rests on is that ingest is IDEMPOTENT. In a class where some phones have
 * data and some do not, the same answers legitimately arrive twice — once from the student's own
 * phone when it finds a signal, and once from the teacher who scanned the room's QR codes. Counting
 * them twice would inflate a child's attempt count, distort their mastery score, and put a number
 * on the teacher's screen that no amount of checking could explain.
 */
const DEVICE = '01931f00-0000-7000-8000-000000000001';

/** Builds an offline batch: `correct` right answers then `wrong` ones, on one skill. */
function offlineBatch(string $skillCode, int $correct, int $wrong, int $startSeq = 1): array
{
    $total = $correct + $wrong;

    // INTERLEAVED across difficulties, not concatenated. Concatenating and taking the first N
    // yields easy items then medium ones and never reaches `hard`, so a batch of eight correct
    // answers correctly fails the hard_correct guard — the test would be asserting against a rule
    // the engine is right to enforce.
    $byDifficulty = collect(['easy', 'medium', 'hard'])->map(
        fn (string $difficulty) => Question::query()
            ->whereHas('skill', fn ($q) => $q->where('code', $skillCode))
            ->where('difficulty', $difficulty)
            ->with('options')
            ->take($total)
            ->get()
            ->values(),
    );

    $questions = collect();
    for ($round = 0; $questions->count() < $total; $round++) {
        foreach ($byDifficulty as $pool) {
            if (isset($pool[$round]) && $questions->count() < $total) {
                $questions->push($pool[$round]);
            }
        }
    }

    $events = [];
    $seq = $startSeq;

    foreach ($questions as $i => $question) {
        $wantCorrect = $i < $correct;
        $option = $question->options->firstWhere('is_correct', $wantCorrect);

        $events[] = [
            'id' => (string) Str::uuid7(),
            'client_seq' => $seq++,
            'type' => 'exercise_attempt',
            'payload' => ['question_id' => $question->id, 'option_id' => $option?->id],
            'client_created_at' => 1767225600 + $seq,
        ];
    }

    return $events;
}

function studentToken(Student $student): string
{
    return $student->createToken('test')->plainTextToken;
}

/**
 * Starts a request as whoever holds this token.
 *
 * The forgetGuards() call is not incidental. Laravel caches the resolved user on the guard for the
 * lifetime of the test's application instance, so a second request carrying a DIFFERENT token
 * silently keeps the first identity. Every real request boots its own application, so this is a
 * testing artifact — but without it, a test that switches from a student to their teacher quietly
 * exercises the student twice and proves nothing.
 */
function actingWith(string $token): TestCase
{
    Auth::forgetGuards();

    return test()->withToken($token);
}

it('ingests a week of offline answers and recomputes mastery from them', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 8, wrong: 0);

    $response = actingWith(studentToken($student))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertOk();

    expect($response->json('accepted'))->toBe(8)
        ->and($response->json('duplicates'))->toBe(0)
        ->and($response->json('last_client_seq'))->toBe(8);

    $progress = $response->json('state.progress.FRC\.ADD\.UNLIKE')
        ?? $response->json('state.progress')['FRC.ADD.UNLIKE'];

    expect($progress['status'])->toBe('mastered');

    // And the path the server hands back already reflects it.
    expect($response->json('state.learning_path'))->not->toBeNull();
});

/**
 * The flagship property. Replaying the identical batch must change nothing at all — not the attempt
 * count, not the score, not the event log.
 */
it('changes nothing when the same batch arrives twice', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 6, wrong: 2);
    $token = studentToken($student);

    actingWith($token)->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events]);

    $after = [
        'attempts' => ExerciseAttempt::count(),
        'events' => SyncEvent::count(),
        'score' => StudentSkill::query()->where('student_id', $student->id)->value('mastery_score'),
    ];

    $replay = actingWith($token)
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertOk();

    expect($replay->json('accepted'))->toBe(0)
        ->and($replay->json('duplicates'))->toBe(8)
        ->and(ExerciseAttempt::count())->toBe($after['attempts'])
        ->and(SyncEvent::count())->toBe($after['events'])
        ->and(StudentSkill::query()->where('student_id', $student->id)->value('mastery_score'))
        ->toBe($after['score']);
});

/**
 * A dropped signal splits a batch in half, and the halves can arrive in either order. Both must
 * land on the same answer, because mastery is recomputed from a log sorted by client_seq rather
 * than accumulated in arrival order.
 */
it('reaches the same result whether the batch arrives in order or backwards', function (): void {
    app(CurriculumSeeder::class)->run();

    $forwards = Student::factory()->grade(6)->create();
    $backwards = Student::factory()->grade(6)->create();

    $inOrder = offlineBatch('FRC.ADD.UNLIKE', correct: 5, wrong: 3);

    actingWith(studentToken($forwards))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $inOrder]);

    // The same answers with fresh event ids — ids are globally unique, so reusing the first
    // student's batch would make every one of these a duplicate and ingest nothing.
    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 5, wrong: 3);

    // Delivered as two batches, later half first, as a dropped signal would.
    $second = array_slice($events, 4);
    $first = array_slice($events, 0, 4);

    $device = '01931f00-0000-7000-8000-000000000002';
    actingWith(studentToken($backwards))
        ->postJson('/api/sync', ['device_id' => $device, 'events' => $second]);
    actingWith(studentToken($backwards))
        ->postJson('/api/sync', ['device_id' => $device, 'events' => $first]);

    $scoreOf = fn (Student $s): float => (float) StudentSkill::query()
        ->where('student_id', $s->id)
        ->value('mastery_score');

    expect($scoreOf($backwards))->toBe($scoreOf($forwards));
});

/**
 * Content is regenerated between releases and question ids move. A student must never be told a
 * week of work was rejected because of that, so an event pointing at a question that no longer
 * exists is dropped and the rest of the batch still lands.
 */
it('drops an event for a question that no longer exists without failing the batch', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 4, wrong: 0);

    $events[] = [
        'id' => (string) Str::uuid7(),
        'client_seq' => 99,
        'type' => 'exercise_attempt',
        'payload' => ['question_id' => 999999, 'option_id' => null],
        'client_created_at' => 1767225600,
    ];

    $response = actingWith(studentToken($student))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertOk();

    expect($response->json('accepted'))->toBe(4)
        ->and($response->json('rejected'))->toBe(1);
});

/**
 * A device that reports the year 2099 must not be able to throw a range error and reject a child's
 * legitimate work — which is why client timestamps are integers, not timestamp columns.
 */
it('accepts work from a device whose clock is wildly wrong', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 3, wrong: 0);

    $events[0]['client_created_at'] = 0; // 1970
    $events[1]['client_created_at'] = 4102444800; // 2100

    actingWith(studentToken($student))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertOk()
        ->assertJsonPath('accepted', 3);
});

it('lets a teacher carry a student\'s work in from the room', function (): void {
    app(CurriculumSeeder::class)->run();

    $teacher = User::factory()->teacher()->create();
    $classroom = Classroom::factory()->create(['teacher_id' => $teacher->id, 'grade' => 6]);
    $student = Student::factory()->inClassroom($classroom)->create();

    $response = actingWith($teacher->createToken('staff')->plainTextToken)
        ->postJson('/api/sync/relay', [
            'device_id' => DEVICE,
            'student_id' => $student->id,
            'channel' => 'qr',
            'events' => offlineBatch('FRC.ADD.UNLIKE', correct: 5, wrong: 0),
        ])
        ->assertOk();

    expect($response->json('accepted'))->toBe(5);

    // The channel is recorded, because it tells the field team how much of a class actually syncs
    // by QR versus over their own connection.
    expect(SyncEvent::query()->where('channel', 'qr')->count())->toBe(5);
});

it('refuses a teacher relaying for a student who is not theirs', function (): void {
    app(CurriculumSeeder::class)->run();

    $teacher = User::factory()->teacher()->create();
    Classroom::factory()->create(['teacher_id' => $teacher->id, 'grade' => 6]);

    $stranger = Student::factory()->grade(6)->create();

    actingWith($teacher->createToken('staff')->plainTextToken)
        ->postJson('/api/sync/relay', [
            'device_id' => DEVICE,
            'student_id' => $stranger->id,
            'events' => offlineBatch('FRC.ADD.UNLIKE', correct: 2, wrong: 0),
        ])
        ->assertStatus(404);

    expect(SyncEvent::count())->toBe(0);
});

it('keeps a student out of the teacher relay', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();

    actingWith(studentToken($student))
        ->postJson('/api/sync/relay', [
            'device_id' => DEVICE,
            'student_id' => $student->id,
            'events' => offlineBatch('FRC.ADD.UNLIKE', correct: 1, wrong: 0),
        ])
        ->assertStatus(403);
});

/**
 * The same child's answers arriving by BOTH routes at once — their own phone AND their teacher's
 * relay. This is what idempotency exists for, and it is the normal case in a room where half the
 * phones have data.
 */
it('counts nothing twice when a phone and a teacher both deliver the same work', function (): void {
    app(CurriculumSeeder::class)->run();

    $teacher = User::factory()->teacher()->create();
    $classroom = Classroom::factory()->create(['teacher_id' => $teacher->id, 'grade' => 6]);
    $student = Student::factory()->inClassroom($classroom)->create();

    $events = offlineBatch('FRC.ADD.UNLIKE', correct: 7, wrong: 1);

    actingWith(studentToken($student))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertOk();

    $relay = actingWith($teacher->createToken('staff')->plainTextToken)
        ->postJson('/api/sync/relay', [
            'device_id' => DEVICE,
            'student_id' => $student->id,
            'channel' => 'qr',
            'events' => $events,
        ])
        ->assertOk();

    expect($relay->json('accepted'))->toBe(0)
        ->and($relay->json('duplicates'))->toBe(8)
        ->and(ExerciseAttempt::query()->where('student_id', $student->id)->count())->toBe(8);
});

it('requires a token', function (): void {
    test()->postJson('/api/sync', ['device_id' => DEVICE, 'events' => []])->assertStatus(401);
});

it('rejects a batch larger than the cap rather than holding a transaction open', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $skill = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();
    $questionId = Question::query()->where('skill_id', $skill->id)->value('id');

    $events = array_map(static fn (int $i): array => [
        'id' => (string) Str::uuid7(),
        'client_seq' => $i,
        'type' => 'exercise_attempt',
        'payload' => ['question_id' => $questionId, 'option_id' => null],
    ], range(1, 501));

    actingWith(studentToken($student))
        ->postJson('/api/sync', ['device_id' => DEVICE, 'events' => $events])
        ->assertStatus(422)
        ->assertJsonValidationErrors('events');
});
