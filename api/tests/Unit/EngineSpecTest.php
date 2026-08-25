<?php

declare(strict_types=1);

use App\Engine\Attempt;
use App\Engine\DiagnosticEngine;
use App\Engine\DiagnosticState;
use App\Engine\Difficulty;
use App\Engine\DifficultyEngine;
use App\Engine\EloEngine;
use App\Engine\MasteryEngine;
use App\Engine\RecoveryPathEngine;
use App\Engine\ReviewEngine;

/**
 * Conformance suite for engine-spec/.
 *
 * These vectors are the contract between this PHP engine and the TypeScript engine that runs on
 * the student's device with no connectivity. web/ replays the SAME files under Vitest. If the two
 * ever disagree, a student gets told they mastered a skill on one device and not on another —
 * which is exactly the kind of bug that never shows up as an error, only as lost trust.
 *
 * A vector is never edited to make a test pass. Change SPEC.md, regenerate, re-run both suites.
 */

/** api/tests/Unit -> api/tests -> api -> repo root. No base_path(): this suite never boots Laravel. */
function repoRoot(): string
{
    return dirname(__DIR__, 3);
}

/** @return array{cases: array<int, array<string, mixed>>} */
function vectors(string $name): array
{
    $path = repoRoot()."/engine-spec/vectors/{$name}.json";

    expect(file_exists($path))->toBeTrue("missing vector file: {$path}");

    return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
}

/** Yields each case keyed by its name, so a failure names the scenario rather than an index. */
function vectorCases(string $name): Closure
{
    return function () use ($name) {
        foreach (vectors($name)['cases'] as $case) {
            yield $case['name'] => [$case];
        }
    };
}

dataset('mastery', vectorCases('mastery'));
dataset('difficulty', vectorCases('difficulty'));
dataset('diagnostic', vectorCases('diagnostic'));
dataset('recovery-path', vectorCases('recovery-path'));
dataset('elo', vectorCases('elo'));
dataset('review', vectorCases('review'));

/* -------------------------------------------------------------------- §1 */

it('reproduces the mastery vectors', function (array $case) {
    $attempts = array_map(Attempt::fromArray(...), $case['input']['attempts']);

    $result = MasteryEngine::evaluate($attempts, $case['input']['threshold'])->toArray();

    // Exact float equality is the point: the client and the server must agree to the last bit,
    // not merely to a tolerance, or a student on the threshold flips verdict per device.
    expect($result['score'])->toBe((float) $case['expected']['score'])
        ->and($result['status'])->toBe($case['expected']['status'])
        ->and($result['attempts'])->toBe($case['expected']['attempts'])
        ->and($result['correct'])->toBe($case['expected']['correct'])
        ->and($result['hard_correct'])->toBe($case['expected']['hard_correct']);
})->with('mastery');

/* -------------------------------------------------------------------- §2 */

it('reproduces the difficulty vectors', function (array $case) {
    $decision = DifficultyEngine::next(
        Difficulty::from($case['input']['difficulty']),
        $case['input']['consecutive_correct'],
        $case['input']['consecutive_wrong'],
    );

    expect($decision->toArray())->toBe($case['expected']);
})->with('difficulty');

/* -------------------------------------------------------------------- §3 */

it('reproduces the diagnostic walks step by step', function (array $case) {
    $state = DiagnosticState::start(
        $case['input']['grade'],
        $case['input']['candidates'],
        $case['input']['max_questions'],
        $case['input']['probe_size'],
    );

    foreach ($case['steps'] as $i => $step) {
        expect(['lo' => $state->lo, 'hi' => $state->hi, 'asked' => $state->asked])
            ->toBe($step['before'], "state diverged before step {$i}");

        expect(DiagnosticEngine::next($state)->toArray())
            ->toBe($step['decision'], "decision diverged at step {$i}");

        if (isset($step['probe'])) {
            $state = $state->withProbe($step['probe']);
        }
    }

    $gradeOf = gradeLookup();

    expect(DiagnosticEngine::result($state, $gradeOf)->toArray())->toBe($case['expected_result']);
})->with('diagnostic');

/* -------------------------------------------------------------------- §4 */

it('reproduces the recovery-path vectors', function (array $case) {
    $path = RecoveryPathEngine::build(
        miniGraph(),
        $case['input']['statuses'],
        $case['input']['target'],
    );

    expect($path)->toBe($case['expected']);
})->with('recovery-path');

/* -------------------------------------------------------------------- §5 */

it('reproduces the elo vectors', function (array $case) {
    $result = EloEngine::update(
        (float) $case['input']['theta'],
        (float) $case['input']['item_elo'],
        $case['input']['correct'],
    );

    expect($result['theta'])->toBe((float) $case['expected']['theta'])
        ->and($result['item_elo'])->toBe((float) $case['expected']['item_elo']);
})->with('elo');

/* -------------------------------------------------------------------- §6 */

it('reproduces the review vectors', function (array $case) {
    expect(ReviewEngine::nextReviewAt($case['input']['mastered_at'], $case['input']['review_count']))
        ->toBe($case['expected']);
})->with('review');

/* ----------------------------------------------------------------- fixture */

/** @return list<array{code: string, grade_level: int, order_index: int, prerequisites: list<string>}> */
function miniGraph(): array
{
    $path = repoRoot().'/engine-spec/fixtures/mini-graph.json';

    return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR)['skills'];
}

/** @return array<string, int> */
function gradeLookup(): array
{
    return array_column(miniGraph(), 'grade_level', 'code');
}
