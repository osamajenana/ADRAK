<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Services\Discovery\MisconceptionAnalyst;
use App\Services\Discovery\MisconceptionDiscoveryService;
use Illuminate\Console\Command;

/**
 * Looks for misconceptions the catalogue does not describe.
 *
 * Run on a schedule against real student data. It writes proposals, never active entries — nothing
 * a model produced reaches a teacher until a person has approved it in the admin queue.
 */
final class DiscoverMisconceptions extends Command
{
    protected $signature = 'adrak:discover-misconceptions
                            {--min-students= : how many students must share a wrong answer}
                            {--dry-run : list the candidates without asking the analyst}';

    protected $description = 'Find recurring wrong answers the misconception catalogue does not explain';

    public function handle(
        MisconceptionDiscoveryService $discovery,
        MisconceptionAnalyst $analyst,
    ): int {
        $minStudents = (int) ($this->option('min-students') ?: config('adrak.discovery.min_students'));

        if ($this->option('dry-run')) {
            return $this->listCandidates($discovery, $minStudents);
        }

        if (! $analyst->isConfigured()) {
            $this->components->warn(
                'No ANTHROPIC_API_KEY configured — discovery is skipped. Everything else is unaffected.',
            );
            $this->components->info('Run with --dry-run to see the candidates it would have analysed.');

            return self::SUCCESS;
        }

        $result = $discovery->discover($minStudents);

        $this->components->twoColumnDetail('candidates found', (string) $result['candidates']);
        $this->components->twoColumnDetail('proposed for review', (string) $result['proposed']);
        $this->components->twoColumnDetail('skipped', (string) $result['skipped']);

        if ($result['proposed'] > 0) {
            $this->newLine();
            $this->components->info('Proposals are awaiting a human decision — none are visible to teachers yet.');
        }

        return self::SUCCESS;
    }

    private function listCandidates(MisconceptionDiscoveryService $discovery, int $minStudents): int
    {
        $candidates = $discovery->candidates($minStudents);

        if ($candidates === []) {
            $this->components->info("No wrong answer is shared by {$minStudents} or more students yet.");

            return self::SUCCESS;
        }

        $this->table(
            ['skill', 'chosen answer', 'students', 'times'],
            array_map(static fn ($c): array => [
                $c->skillCode,
                $c->chosenAnswer,
                $c->studentCount,
                $c->occurrences,
            ], $candidates),
        );

        return self::SUCCESS;
    }
}
