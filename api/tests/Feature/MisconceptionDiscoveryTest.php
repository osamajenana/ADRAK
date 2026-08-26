<?php

declare(strict_types=1);

use App\Models\ExerciseAttempt;
use App\Models\Misconception;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use App\Models\Student;
use App\Services\Discovery\MisconceptionAnalyst;
use App\Services\Discovery\MisconceptionDiscoveryService;
use App\Services\Discovery\MisconceptionProposal;
use App\Services\Discovery\NullMisconceptionAnalyst;
use Database\Seeders\CurriculumSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

/**
 * Finding misconceptions nobody wrote down.
 *
 * The analyst is faked throughout. These tests are about the pipeline — what it considers a
 * candidate, what it refuses to activate, and what an approval does to the history — not about
 * whether a model writes good Arabic, which is not something a test can assert.
 */

/** An analyst that returns a fixed proposal for every candidate it is given. */
function fakeAnalyst(MisconceptionProposal $proposal): MisconceptionAnalyst
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

/**
 * Has `count` students all choose the same untagged wrong answer.
 *
 * The option's misconception link is cleared first: the point of discovery is the errors the
 * catalogue does NOT already explain.
 */
/** @return array{0: Skill, 1: QuestionOption} */
function shareUntaggedWrongAnswer(string $skillCode, int $count): array
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

it('finds a wrong answer several students share that nothing explains', function (): void {
    [, $wrong] = shareUntaggedWrongAnswer('FRC.ADD.UNLIKE', 4);

    $candidates = app(MisconceptionDiscoveryService::class)->candidates(minStudents: 3);

    expect($candidates)->not->toBeEmpty();

    $found = collect($candidates)->firstWhere('chosenAnswer', $wrong->text_ar);

    expect($found)->not->toBeNull()
        ->and($found->studentCount)->toBe(4)
        // The mathematics travels with the candidate, not just the string, so the analyst can see
        // why the wrong answer was attractive.
        ->and($found->examples)->not->toBeEmpty()
        ->and($found->examples[0])->toHaveKeys(['stem', 'expression', 'correct']);
});

it('ignores a wrong answer only one or two students chose', function (): void {
    [, $wrong] = shareUntaggedWrongAnswer('FRC.ADD.UNLIKE', 2);

    $candidates = app(MisconceptionDiscoveryService::class)->candidates(minStudents: 3);

    expect(collect($candidates)->firstWhere('chosenAnswer', $wrong->text_ar))->toBeNull();
});

/**
 * A distractor that already carries a misconception has an explanation. Re-proposing one would
 * fill the review queue with things already known and train the reviewer to skim.
 */
it('ignores wrong answers the catalogue already explains', function (): void {
    $skill = Skill::query()->where('code', 'FRC.ADD.UNLIKE')->firstOrFail();

    $tagged = QuestionOption::query()
        ->whereHas('question', fn ($q) => $q->where('skill_id', $skill->id))
        ->whereNotNull('misconception_id')
        ->firstOrFail();

    for ($i = 0; $i < 5; $i++) {
        ExerciseAttempt::create([
            'student_id' => Student::factory()->grade(6)->create()->id,
            'question_id' => $tagged->question_id,
            'skill_id' => $skill->id,
            'selected_option_id' => $tagged->id,
            'is_correct' => false,
            'difficulty_at_attempt' => 'medium',
            'misconception_id' => $tagged->misconception_id,
            'client_seq' => $i + 1,
        ]);
    }

    $candidates = app(MisconceptionDiscoveryService::class)->candidates(minStudents: 3);

    expect(collect($candidates)->firstWhere('chosenAnswer', $tagged->text_ar))->toBeNull();
});

/**
 * The whole point of the review gate. A model's proposal is stored, and a teacher cannot see it.
 */
it('stores what the analyst proposes without letting a teacher see it', function (): void {
    shareUntaggedWrongAnswer('FRC.ADD.UNLIKE', 4);

    $service = new MisconceptionDiscoveryService(
        fakeAnalyst(new MisconceptionProposal('frc.invented_rule', 'قاعدة مخترعة', 'اشرح بالتمثيل.', 0.8)),
    );

    $result = $service->discover(minStudents: 3);

    expect($result['proposed'])->toBe(1);

    $proposal = Misconception::query()->where('tag', 'frc.invented_rule')->firstOrFail();

    expect($proposal->status)->toBe(Misconception::STATUS_PROPOSED)
        ->and($proposal->source)->toBe(Misconception::SOURCE_DISCOVERED);

    // The teacher dashboard reads only active entries, so this is invisible until approved.
    expect(Misconception::query()->active()->where('tag', 'frc.invented_rule')->exists())->toBeFalse();
});

/**
 * A deployment with no outbound connection — a realistic description of where this runs — must
 * serve every other feature unchanged.
 */
it('does nothing at all when no API key is configured', function (): void {
    shareUntaggedWrongAnswer('FRC.ADD.UNLIKE', 4);

    $service = new MisconceptionDiscoveryService(new NullMisconceptionAnalyst);
    $result = $service->discover(minStudents: 3);

    expect($result['candidates'])->toBeGreaterThan(0)
        ->and($result['proposed'])->toBe(0)
        ->and(Misconception::query()->where('source', Misconception::SOURCE_DISCOVERED)->count())->toBe(0);
});
