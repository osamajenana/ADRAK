<?php

declare(strict_types=1);

use App\Engine\DiagnosticResult;
use App\Engine\Difficulty;
use App\Engine\MasteryStatus;
use App\Models\DiagnosticTest;
use App\Models\LearningPathItem;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use App\Models\Student;
use App\Models\Subject;
use App\Services\DiagnosticService;
use App\Services\ExerciseService;
use App\Services\RecoveryPathService;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The scenario the whole product exists to perform, end to end:
 *
 *   login → diagnostic → gaps found → recovery path → practise → mastered → next unlocked
 *
 * Everything below runs against the real seeded curriculum, not fixtures. A student who "knows"
 * arithmetic but not fractions should come out of the diagnostic assessed below their grade, with
 * a path that starts at their first real gap rather than at their year group.
 */

/** Answers a question correctly or incorrectly by picking a real option from the bank. */
function answer(Question $question, bool $correct): QuestionOption
{
    $options = $question->options;

    return $correct
        ? $options->firstWhere('is_correct', true)
        : $options->firstWhere('is_correct', false);
}

/**
 * Walks a whole diagnostic, answering as a student whose real ceiling is `masteredThrough`.
 *
 * @return array{0: DiagnosticTest, 1: DiagnosticResult}
 */
function walkDiagnostic(Student $student, int $masteredThrough): array
{
    $service = app(DiagnosticService::class);
    $test = $service->start($student, Subject::query()->firstOrFail());

    $guard = 0;
    while (($question = $service->nextQuestion($test->fresh())) !== null && $guard++ < 40) {
        $knowsIt = $question->skill->order_index <= $masteredThrough;
        $service->recordAnswer($test->fresh(), $question, answer($question, $knowsIt));
    }

    // complete() first: PHP evaluates array elements left to right, so reading the model
    // alongside the call would capture it before the call had written anything.
    $result = $service->complete($test->fresh());

    return [$test->fresh(), $result];
}

it('finds a student is working below their grade, in far fewer questions than a placement paper', function (): void {
    app(CurriculumSeeder::class)->run();

    // Declared grade 7. Real ceiling: long division — everything from fractions up is a gap.
    $ceiling = Skill::query()->where('code', 'OPS.DIV.LONG')->value('order_index');
    $student = Student::factory()->grade(7)->create();

    [$test, $result] = walkDiagnostic($student, $ceiling);

    expect($test->status)->toBe('completed')
        ->and($result->estimatedLevel)->toBeLessThan(7)
        ->and($result->mastered)->toContain('OPS.DIV.LONG')
        ->and($result->missing)->not->toBeEmpty();

    // The headline claim, measured rather than asserted in a slide.
    expect($test->answers()->count())->toBeLessThanOrEqual(15);
});

it('builds a recovery path that starts at the first real gap, not at the student grade', function (): void {
    app(CurriculumSeeder::class)->run();

    $ceiling = Skill::query()->where('code', 'OPS.DIV.LONG')->value('order_index');
    $student = Student::factory()->grade(7)->create();

    walkDiagnostic($student, $ceiling);

    $path = $student->learningPaths()->where('is_active', true)->with('items.skill')->firstOrFail();

    expect($path->items)->not->toBeEmpty();

    // Nothing already mastered is on the path — the point is to skip what they can do.
    $mastered = $student->skills()->where('status', MasteryStatus::Mastered->value)->pluck('skill_id');
    expect($path->items->pluck('skill_id')->intersect($mastered))->toBeEmpty();

    // Prerequisite order is preserved, so a step never arrives before its foundation.
    $orders = $path->items->map(fn (LearningPathItem $i): int => $i->skill->order_index)->all();
    expect($orders)->toBe(collect($orders)->sort()->values()->all());

    // Exactly one step is open. Eleven unlocked skills is the same overwhelm that made the gap.
    expect($path->items->where('status', LearningPathItem::STATUS_CURRENT))->toHaveCount(1)
        ->and($path->items->first()->status)->toBe(LearningPathItem::STATUS_CURRENT);
});

it('promotes difficulty as a student succeeds and masters the skill', function (): void {
    app(CurriculumSeeder::class)->run();

    $exercises = app(ExerciseService::class);
    $student = Student::factory()->grade(6)->create();
    $skill = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();

    // Starts easy: a child told for two years that they are behind meets a winnable question first.
    expect($exercises->currentDecision($student, $skill)->difficulty)->toBe(Difficulty::Easy);

    $seen = [];
    for ($i = 0; $i < 8; $i++) {
        $question = $exercises->nextQuestion($student, $skill);
        expect($question)->not->toBeNull();

        $seen[] = $question->difficulty;
        $exercises->submit($student, $question, answer($question, true));
    }

    // Two correct promotes, so eight straight wins should have climbed through every level.
    expect($seen)->toContain(Difficulty::Easy)
        ->and($seen)->toContain(Difficulty::Medium)
        ->and($seen)->toContain(Difficulty::Hard);

    $studentSkill = $student->skills()->where('skill_id', $skill->id)->firstOrFail();

    expect($studentSkill->status)->toBe(MasteryStatus::Mastered)
        ->and($studentSkill->mastery_score)->toBe(100.0)
        ->and($studentSkill->hard_correct)->toBeGreaterThanOrEqual(2)
        ->and($studentSkill->mastered_at)->not->toBeNull()
        // Retention, not just attainment: mastery schedules its own re-check.
        ->and($studentSkill->next_review_at)->not->toBeNull();
});

it('refuses to call a skill mastered on easy questions alone', function (): void {
    app(CurriculumSeeder::class)->run();

    $exercises = app(ExerciseService::class);
    $student = Student::factory()->grade(6)->create();
    $skill = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();

    // Ten perfect answers, all pinned to `easy`. A teacher would not accept that as mastery and
    // neither does the engine, however good the score looks.
    for ($i = 0; $i < 10; $i++) {
        $question = $exercises->nextQuestion($student, $skill, Difficulty::Easy);
        $exercises->submit($student, $question, answer($question, true));
    }

    $studentSkill = $student->skills()->where('skill_id', $skill->id)->firstOrFail();

    expect($studentSkill->mastery_score)->toBe(100.0)
        ->and($studentSkill->hard_correct)->toBe(0)
        ->and($studentSkill->status)->toBe(MasteryStatus::Learning);
});

it('sends a struggling student down to the prerequisite instead of drilling the same wall', function (): void {
    app(CurriculumSeeder::class)->run();

    $exercises = app(ExerciseService::class);
    $student = Student::factory()->grade(6)->create();
    $skill = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();

    $decision = null;
    for ($i = 0; $i < 3; $i++) {
        $question = $exercises->nextQuestion($student, $skill, Difficulty::Easy);
        $decision = $exercises->submit($student, $question, answer($question, false))['decision'];
    }

    expect($decision->action->value)->toBe('route_to_prerequisite');

    $prerequisite = $exercises->prerequisiteFor($student, $skill);

    expect($prerequisite)->not->toBeNull()
        ->and($skill->prerequisites->pluck('code'))->toContain($prerequisite->code);
});

it('unlocks the next step only once every prerequisite is in place', function (): void {
    app(CurriculumSeeder::class)->run();

    $student = Student::factory()->grade(6)->create();
    $recovery = app(RecoveryPathService::class);
    $exercises = app(ExerciseService::class);

    // FRC.ADD.UNLIKE needs three foundations. Master one and it must stay shut.
    $target = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();
    $recovery->generate($student, $target);

    $first = $target->prerequisites()->orderBy('order_index')->firstOrFail();

    for ($i = 0; $i < 8; $i++) {
        $question = $exercises->nextQuestion($student, $first);
        if ($question === null) {
            break; // this prerequisite has no bank yet; the guard below still holds
        }
        $exercises->submit($student, $question, answer($question, true));
    }

    $targetItem = $student->learningPaths()->where('is_active', true)->firstOrFail()
        ->items()->where('skill_id', $target->id)->first();

    expect($targetItem?->status)->not->toBe(LearningPathItem::STATUS_CURRENT);
});
