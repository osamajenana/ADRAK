<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Engine\MasteryStatus;
use App\Models\Skill;
use App\Models\Student;
use App\Models\StudentSkill;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StudentSkill>
 *
 * `skill_id` defaults to a real seeded skill rather than a fabricated one — the graph comes from
 * content/ and has no factory. Seed CurriculumSeeder before using this factory without an explicit
 * skill.
 */
final class StudentSkillFactory extends Factory
{
    protected $model = StudentSkill::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'student_id' => Student::factory(),
            'skill_id' => fn (): int => Skill::query()->inRandomOrder()->value('id'),
            'mastery_score' => 0,
            'theta' => 1200,
            'attempts' => 0,
            'correct_answers' => 0,
            'hard_correct' => 0,
            'status' => MasteryStatus::NotStarted,
        ];
    }

    public function mastered(): self
    {
        return $this->state(fn (): array => [
            'mastery_score' => 92.5,
            'attempts' => 10,
            'correct_answers' => 9,
            'hard_correct' => 3,
            'status' => MasteryStatus::Mastered,
            'mastered_at' => now(),
        ]);
    }

    /** A student actively working on this skill without having reached it — the smart-group case. */
    public function learning(): self
    {
        return $this->state(fn (): array => [
            'mastery_score' => 48.0,
            'attempts' => 6,
            'correct_answers' => 2,
            'hard_correct' => 0,
            'status' => MasteryStatus::Learning,
        ]);
    }
}
