<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Device;
use App\Models\Student;
use App\Models\SyncEvent;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<SyncEvent> */
final class SyncEventFactory extends Factory
{
    protected $model = SyncEvent::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            // UUIDv7, minted client-side. Time-ordered, so it keeps the primary-key index
            // append-friendly instead of scattering writes the way v4 would.
            'id' => (string) Str::uuid7(),
            'device_id' => Device::factory(),
            'student_id' => Student::factory(),
            'client_seq' => $this->faker->numberBetween(1, 1000),
            'type' => $this->faker->randomElement(['exercise_attempt', 'diagnostic_answer', 'skill_mastered']),
            'payload' => [],
            'client_created_at' => now()->getTimestamp(),
            'server_received_at' => now(),
            'channel' => SyncEvent::CHANNEL_CLOUD,
        ];
    }
}
