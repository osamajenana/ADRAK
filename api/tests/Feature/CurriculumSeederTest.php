<?php

declare(strict_types=1);

use App\Models\Misconception;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

/**
 * Seeds through the container instead of the TestCase helper. Pest rebinds the test closure's
 * $this at runtime, which static analysis cannot follow, so calling the helper reads as a call
 * on Pest's pending-call object. Invoking the seeder directly needs no rebinding, keeps these
 * tests inside PHPStan's coverage rather than excluded from it, and says the same thing.
 */
function seedCurriculum(): void
{
    app(CurriculumSeeder::class)->run();
}

/**
 * Content integrity.
 *
 * Deliberately grouped into three tests rather than a dozen. RefreshDatabase re-migrates and
 * re-seeds per test against in-memory SQLite, so every extra `it()` costs ~10 seconds of a limited
 * daily power budget. Related assertions that share one seed belong together.
 */
it('seeds the whole graph, bank and catalogue', function (): void {
    seedCurriculum();

    expect(Skill::count())->toBe(58)
        ->and(Skill::where('is_spine', true)->count())->toBe(36)
        ->and(Misconception::count())->toBe(102)
        ->and(Question::count())->toBe(510)
        ->and(QuestionOption::count())->toBe(2040);

    // The search space the diagnostic will binary-search for a grade-7 student.
    $candidates = Skill::candidatesForGrade(7)->pluck('code')->all();

    expect($candidates)->not->toBeEmpty()
        ->and($candidates)->toContain('OPS.ADD')
        ->and($candidates)->not->toContain('ALG.QUAD'); // grade 9 — above this student
});

it('keeps the seeded content structurally coherent', function (): void {
    seedCurriculum();

    // ── The invariant the entire engine rests on ────────────────────────────────────────────
    // DiagnosticEngine binary-searches the skill list and RecoveryPathEngine orders by
    // order_index; both are correct only because a prerequisite always sorts before its
    // dependent. Break it and the diagnostic infers mastery the student never showed, while the
    // recovery path hands out a skill before its foundation. Neither failure throws.
    $orderOf = Skill::pluck('order_index', 'id');
    $edges = DB::table('skill_prerequisites')->get();

    expect($edges)->not->toBeEmpty();

    foreach ($edges as $edge) {
        expect($orderOf[$edge->prerequisite_skill_id])->toBeLessThan($orderOf[$edge->skill_id]);
    }

    // ── Exactly one correct option per question ─────────────────────────────────────────────
    $badOptionCounts = DB::table('question_options')
        ->select('question_id', DB::raw('SUM(is_correct) as correct_count'))
        ->groupBy('question_id')
        ->having('correct_count', '!=', 1)
        ->count();

    expect($badOptionCounts)->toBe(0);

    // ── No option tagged with another skill's misconception ─────────────────────────────────
    // Tags are resolved by string lookup in the seeder, so a cross-skill mislink would be
    // invisible in the data and poisonous on the dashboard: a teacher told their class shares an
    // error that belongs to a different topic entirely.
    $crossSkill = DB::table('question_options')
        ->join('questions', 'questions.id', '=', 'question_options.question_id')
        ->join('misconceptions', 'misconceptions.id', '=', 'question_options.misconception_id')
        ->whereColumn('misconceptions.skill_id', '!=', 'questions.skill_id')
        ->count();

    expect($crossSkill)->toBe(0);

    // ── The correct answer is never a misconception ─────────────────────────────────────────
    expect(QuestionOption::where('is_correct', true)->whereNotNull('misconception_id')->count())
        ->toBe(0);

    // ── Most distractors still carry analytics signal ───────────────────────────────────────
    // Not 100%: where a skill catalogues fewer misconceptions than a question needs options, the
    // filler is left untagged rather than mislabelled. Guarding the ratio makes a regression that
    // silently drops tags fail here, instead of quietly hollowing out the teacher dashboard.
    $distractors = QuestionOption::where('is_correct', false)->count();
    $tagged = QuestionOption::where('is_correct', false)->whereNotNull('misconception_id')->count();

    expect($tagged / $distractors)->toBeGreaterThan(0.55);
});

it('re-seeds without duplicating anything', function (): void {
    seedCurriculum();

    $before = [Skill::count(), Question::count(), QuestionOption::count(), Misconception::count()];

    // The demo server re-seeds nightly so every judge opens clean data; a seeder that grew the
    // bank on each run would quietly break that within a week.
    seedCurriculum();

    expect([Skill::count(), Question::count(), QuestionOption::count(), Misconception::count()])
        ->toBe($before);
});
