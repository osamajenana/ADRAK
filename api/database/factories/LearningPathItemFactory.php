<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\LearningPath;
use App\Models\LearningPathItem;
use App\Models\Skill;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<LearningPathItem> */
final class LearningPathItemFactory extends Factory
{
    protected $model = LearningPathItem::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'learning_path_id' => LearningPath::factory(),
            'skill_id' => fn (): ?int => Skill::query()->inRandomOrder()->value('id'),
            'order_index' => $this->faker->numberBetween(0, 10),
            'status' => LearningPathItem::STATUS_LOCKED,
        ];
    }
}
