<?php

declare(strict_types=1);

namespace App\Models;

use App\Engine\MasteryStatus;
use Database\Factories\StudentSkillFactory;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Where one student stands on one skill.
 *
 * Every column here is DERIVED from exercise_attempts by MasteryEngine. It exists so dashboards
 * are one indexed read instead of a replay, and it is recomputed on sync — the attempt log stays
 * the truth, this is a cache with a good memory.
 *
 * @property MasteryStatus $status
 * @property float $mastery_score
 * @property float $theta
 * @property int $review_count
 * @property Carbon|null $mastered_at
 * @property Carbon|null $next_review_at
 */
final class StudentSkill extends Model
{
    /** @use HasFactory<StudentSkillFactory> */
    use HasFactory;

    protected $fillable = [
        'student_id', 'skill_id', 'mastery_score', 'theta', 'attempts',
        'correct_answers', 'hard_correct', 'status', 'mastered_at',
        'next_review_at', 'review_count',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'mastery_score' => 'float',
            'theta' => 'float',
            'attempts' => 'integer',
            'correct_answers' => 'integer',
            'hard_correct' => 'integer',
            'status' => MasteryStatus::class,
            'mastered_at' => 'datetime',
            'next_review_at' => 'datetime',
            'review_count' => 'integer',
        ];
    }

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /** @return BelongsTo<Skill, $this> */
    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    /**
     * Students actively working on a skill without having reached it — the population the
     * teacher's smart groups are built from.
     *
     * @param  Builder<StudentSkill>  $query
     */
    public function scopeStruggling(Builder $query): void
    {
        $query->where('status', MasteryStatus::Learning->value);
    }

    /** @param  Builder<StudentSkill>  $query */
    public function scopeDueForReview(Builder $query): void
    {
        $query->where('status', MasteryStatus::Mastered->value)
            ->whereNotNull('next_review_at')
            ->where('next_review_at', '<=', now());
    }
}
