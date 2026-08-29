<?php

declare(strict_types=1);

namespace App\Console\Commands;

use Database\Seeders\DemoSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Puts the demo classroom back the way a judge should find it.
 *
 * Scheduled nightly. Judging runs for weeks and the link is public: without this, the tenth person
 * to open it meets a class whose progress has been scribbled over by the nine before them, and
 * concludes the thing does not work.
 *
 * Clears student-side data only. The curriculum is content, not state, and survives.
 */
final class DemoReset extends Command
{
    protected $signature = 'adrak:demo-reset {--force : run outside local without confirming}';

    protected $description = 'Wipe student progress and rebuild the demo classroom';

    /**
     * Student-side tables, ordered so children go before parents.
     *
     * @var list<string>
     */
    private const TABLES = [
        'exercise_attempts',
        'diagnostic_answers',
        'diagnostic_tests',
        'learning_path_items',
        'learning_paths',
        'student_skills',
        'sync_events',
        'devices',
        'students',
        'classrooms',
        'personal_access_tokens',
    ];

    public function handle(): int
    {
        if (app()->isProduction() && ! $this->option('force')) {
            $this->components->error('Refusing to wipe progress in production without --force.');

            return self::FAILURE;
        }

        $this->components->info('Resetting the demo classroom …');

        DB::transaction(function (): void {
            // Constraints are lifted for the truncate window only. On SQLite this is a PRAGMA and
            // on MariaDB a session variable, so neither leaks outside this command.
            Schema::withoutForeignKeyConstraints(function (): void {
                foreach (self::TABLES as $table) {
                    DB::table($table)->delete();
                }
            });
        });

        $this->call('db:seed', ['--class' => DemoSeeder::class, '--force' => true]);

        $this->newLine();
        $this->components->twoColumnDetail('class code', DemoSeeder::JOIN_CODE);
        $this->components->twoColumnDetail('teacher', DemoSeeder::TEACHER_EMAIL);
        $this->components->twoColumnDetail('admin', DemoSeeder::ADMIN_EMAIL);
        $this->components->twoColumnDetail('password', DemoSeeder::PASSWORD);
        $this->components->twoColumnDetail('student PIN', '1234');

        return self::SUCCESS;
    }
}
