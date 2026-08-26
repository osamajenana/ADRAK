<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\LearningPathFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class LearningPath extends Model
{
    /** @use HasFactory<LearningPathFactory> */
    use HasFactory;

    protected $fillable = ['student_id', 'target_skill_id', 'is_active'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /** @return BelongsTo<Skill, $this> */
    public function targetSkill(): BelongsTo
    {
        return $this->belongsTo(Skill::class, 'target_skill_id');
    }

    /** @return HasMany<LearningPathItem, $this> */
    public function items(): HasMany
    {
        return $this->hasMany(LearningPathItem::class)->orderBy('order_index');
    }
}
