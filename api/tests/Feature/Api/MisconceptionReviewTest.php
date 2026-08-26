<?php

declare(strict_types=1);

use App\Models\ExerciseAttempt;
use App\Models\Misconception;
use App\Models\Question;
use App\Models\Skill;
use App\Models\Student;
use App\Models\User;
use App\Services\Discovery\MisconceptionAnalyst;
use App\Services\Discovery\MisconceptionDiscoveryService;
use App\Services\Discovery\MisconceptionProposal;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * The human review gate over discovered misconceptions.
 *
 * Lives beside the other API tests because it drives Pest's HTTP DSL, which static analysis cannot
 * follow. The pipeline itself is tested in tests/Feature/MisconceptionDiscoveryTest.php, where it
 * stays inside PHPStan's coverage.
 */

/** Returns a fixed proposal for every candidate it is handed. */
function reviewAnalyst(MisconceptionProposal $proposal): MisconceptionAnalyst
{
    return new class($proposal) implements MisconceptionAnalyst
    {
        public function __construct(private readonly MisconceptionProposal $proposal) {}

        public function analyse(array $candidates): array
        {
            $out = [];
            foreach ($candidates as $candidate) {
                $out["{$candidate->skillCode}|{$candidate->chosenAnswer}"] = $this->proposal;
            }

            return $out;
        }

        public function isConfigured(): bool
        {
            return true;
        }
    };
}

/** Has `count` students all choose the same untagged wrong answer. */
function seedSharedWrongAnswer(string $skillCode, int $count): array
{
    $skill = Skill::query()->where('code', $skillCode)->firstOrFail();

    $question = Question::query()
        ->where('skill_id', $skill->id)
        ->whereHas('options', fn ($q) => $q->where('is_correct', false))
        ->with('options')
        ->firstOrFail();

    $wrong = $question->options->firstWhere('is_correct', false);
    $wrong->update(['misconception_id' => null]);

    for ($i = 0; $i < $count; $i++) {
        ExerciseAttempt::create([
            'student_id' => Student::factory()->grade(6)->create()->id,
            'question_id' => $question->id,
            'skill_id' => $skill->id,
            'selected_option_id' => $wrong->id,
            'is_correct' => false,
            'difficulty_at_attempt' => $question->difficulty,
            'misconception_id' => null,
            'client_seq' => $i + 1,
        ]);
    }

    return [$skill, $wrong];
}

beforeEach(function (): void {
    app(CurriculumSeeder::class)->run();
});

/**
 * Back-tagging is what makes an approval worth anything. Without it the new misconception would
 * describe only future answers, and a teacher would see a count of one on something a class has
 * been doing all term.
 */
it('re-tags the history when a proposal is approved', function (): void {
    [, $wrong] = seedSharedWrongAnswer('FRC.ADD.UNLIKE', 4);

    $service = new MisconceptionDiscoveryService(
        reviewAnalyst(new MisconceptionProposal('frc.invented_rule', 'قاعدة مخترعة', 'اشرح بالتمثيل.', 0.8)),
    );
    $service->discover(minStudents: 3);

    $proposal = Misconception::query()->where('tag', 'frc.invented_rule')->firstOrFail();

    $admin = User::factory()->admin()->create();

    $response = test()->withToken($admin->createToken('admin')->plainTextToken)
        ->postJson("/api/admin/misconceptions/{$proposal->id}/approve", [
            'chosen_answer' => $wrong->text_ar,
        ])
        ->assertOk();

    expect($response->json('status'))->toBe(Misconception::STATUS_ACTIVE)
        ->and($response->json('retagged_attempts'))->toBe(4);

    // And the option carries the link now, so questions served from here on are tagged at source.
    expect($wrong->fresh()->misconception_id)->toBe($proposal->id);
});

it('lets an admin reject a proposal outright', function (): void {
    seedSharedWrongAnswer('FRC.ADD.UNLIKE', 4);

    $service = new MisconceptionDiscoveryService(
        reviewAnalyst(new MisconceptionProposal('frc.nonsense', 'اقتراح خاطئ', 'لا شيء.', 0.3)),
    );
    $service->discover(minStudents: 3);

    $proposal = Misconception::query()->where('tag', 'frc.nonsense')->firstOrFail();
    $admin = User::factory()->admin()->create();

    test()->withToken($admin->createToken('admin')->plainTextToken)
        ->postJson("/api/admin/misconceptions/{$proposal->id}/reject")
        ->assertOk()
        ->assertJsonPath('status', Misconception::STATUS_REJECTED);

    expect(Misconception::query()->active()->where('tag', 'frc.nonsense')->exists())->toBeFalse();
});

it('keeps teachers out of the review queue', function (): void {
    $teacher = User::factory()->teacher()->create();

    test()->withToken($teacher->createToken('staff')->plainTextToken)
        ->getJson('/api/admin/misconceptions/proposals')
        ->assertStatus(403);
});
