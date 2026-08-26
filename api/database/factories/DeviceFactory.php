<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Device;
use App\Models\Student;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Device> */
final class DeviceFactory extends Factory
{
    protected $model = Device::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'student_id' => Student::factory(),
            'label' => $this->faker->randomElement(['هاتف العائلة', 'لوحي المركز', 'هاتف الجار']),
            'last_client_seq' => 0,
        ];
    }
}
