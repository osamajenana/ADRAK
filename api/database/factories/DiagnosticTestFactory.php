<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\DiagnosticTest;
use App\Models\Student;
use App\Models\Subject;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<DiagnosticTest> */
final class DiagnosticTestFactory extends Factory
{
    protected $model = DiagnosticTest::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $grade = $this->faker->numberBetween(4, 9);

        return [
            'student_id' => Student::factory()->grade($grade),
            'subject_id' => fn (): ?int => Subject::query()->value('id'),
            'status' => DiagnosticTest::STATUS_IN_PROGRESS,
            'grade_at_start' => $grade,
            'lo' => -1,
            'hi' => 0,
            'asked' => 0,
        ];
    }

    public function completed(int $estimatedLevel): self
    {
        return $this->state(fn (): array => [
            'status' => DiagnosticTest::STATUS_COMPLETED,
            'estimated_level' => $estimatedLevel,
            'completed_at' => now(),
        ]);
    }
}
