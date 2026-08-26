<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Engine\Difficulty;
use App\Models\ExerciseAttempt;
use App\Models\Question;
use App\Models\Student;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ExerciseAttempt>
 *
 * Defaults to a real seeded question so the attempt's skill, difficulty and misconception line up
 * with actual content. Seed CurriculumSeeder first.
 */
final class ExerciseAttemptFactory extends Factory
{
    protected $model = ExerciseAttempt::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        // firstOrFail, not first: this factory is documented as requiring seeded content, and a
        // silent fallback would build attempts whose skill and difficulty match no real question.
        $question = Question::query()->inRandomOrder()->firstOrFail();

        return [
            'student_id' => Student::factory(),
            'question_id' => $question->id,
            'skill_id' => $question->skill_id,
            'is_correct' => $this->faker->boolean(),
            'difficulty_at_attempt' => $question->difficulty,
            'client_seq' => $this->faker->numberBetween(1, 500),
            'client_created_at' => now()->getTimestamp(),
        ];
    }

    public function forQuestion(Question $question): self
    {
        return $this->state(fn (): array => [
            'question_id' => $question->id,
            'skill_id' => $question->skill_id,
            'difficulty_at_attempt' => $question->difficulty,
        ]);
    }

    public function correct(bool $correct = true): self
    {
        return $this->state(fn (): array => ['is_correct' => $correct]);
    }
}
