<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\LearningPath;
use App\Models\Skill;
use App\Models\Student;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningPath> */
final class LearningPathFactory extends Factory
{
    protected $model = LearningPath::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'student_id' => Student::factory(),
            'target_skill_id' => fn (): ?int => Skill::query()->inRandomOrder()->value('id'),
            'is_active' => true,
        ];
    }
}
