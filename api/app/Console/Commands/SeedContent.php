<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\CurriculumSeeder;
use Illuminate\Console\Command;

/**
 * Loads content/ into the database and reports what landed.
 *
 * The seeder itself returns counts and prints nothing — data loading and presentation are separate
 * jobs, and keeping them apart means the seeder never reaches for Seeder::$command, which Laravel
 * declares non-nullable but leaves unset whenever a seeder runs outside artisan.
 *
 * Runs nightly on the demo server so every judge who opens the link finds clean data.
 */
final class SeedContent extends Command
{
    protected $signature = 'nabd:seed-content';

    protected $description = 'Load the skill graph and question bank from content/ into the database';

    public function handle(CurriculumSeeder $seeder): int
    {
        $this->components->info('Loading content/ …');

        $counts = $seeder->load();

        $this->table(
            ['skills', 'misconceptions', 'questions'],
            [[$counts['skills'], $counts['misconceptions'], $counts['questions']]],
        );

        return self::SUCCESS;
    }
}
