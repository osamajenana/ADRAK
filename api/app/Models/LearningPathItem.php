<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\LearningPathItemFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

final class LearningPathItem extends Model
{
    /** @use HasFactory<LearningPathItemFactory> */
    use HasFactory;

    public const STATUS_LOCKED = 'locked';

    public const STATUS_CURRENT = 'current';

    public const STATUS_DONE = 'done';

    public $timestamps = false;

    protected $fillable = ['learning_path_id', 'skill_id', 'order_index', 'status'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['order_index' => 'integer'];
    }

    /** @return BelongsTo<LearningPath, $this> */
    public function learningPath(): BelongsTo
    {
        return $this->belongsTo(LearningPath::class);
    }

    /** @return BelongsTo<Skill, $this> */
    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }
}
