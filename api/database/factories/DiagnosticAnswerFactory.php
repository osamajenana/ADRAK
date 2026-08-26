<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\DiagnosticAnswer;
use App\Models\DiagnosticTest;
use App\Models\Question;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<DiagnosticAnswer> */
final class DiagnosticAnswerFactory extends Factory
{
    protected $model = DiagnosticAnswer::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $question = Question::query()->inRandomOrder()->firstOrFail();

        return [
            'diagnostic_test_id' => DiagnosticTest::factory(),
            'question_id' => $question->id,
            'skill_id' => $question->skill_id,
            'is_correct' => $this->faker->boolean(),
            'probe_step' => $this->faker->numberBetween(0, 4),
        ];
    }
}
