<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Classroom;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Classroom> */
final class ClassroomFactory extends Factory
{
    protected $model = Classroom::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'teacher_id' => User::factory()->teacher(),
            'name' => 'صف '.$this->faker->numberBetween(1, 4),
            'join_code' => Classroom::generateJoinCode(),
            'grade' => $this->faker->numberBetween(4, 9),
        ];
    }

    public function grade(int $grade): self
    {
        return $this->state(fn (): array => ['grade' => $grade]);
    }
}
