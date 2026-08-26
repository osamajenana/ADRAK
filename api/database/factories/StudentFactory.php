<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\Student;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Student> */
final class StudentFactory extends Factory
{
    protected $model = Student::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'classroom_id' => Classroom::factory(),
            // First name only — the model holds nothing more, and neither should its fixtures.
            'display_name' => $this->faker->randomElement(['أحمد', 'ليان', 'يوسف', 'سما', 'كرم', 'جنى', 'زيد', 'مريم']),
            'grade' => $this->faker->numberBetween(4, 9),
            'pin_hash' => '1234',
            'login_token' => Student::generateLoginToken(),
        ];
    }

    public function grade(int $grade): self
    {
        return $this->state(fn (): array => ['grade' => $grade]);
    }

    public function inClassroom(Classroom $classroom): self
    {
        return $this->state(fn (): array => [
            'classroom_id' => $classroom->id,
            'grade' => $classroom->grade,
        ]);
    }
}
