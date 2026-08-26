<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One node of the skill graph.
 *
 * `order_index` is topological: every skill sorts after all of its prerequisites. The diagnostic
 * binary search and the recovery path both rely on that, and it is computed by
 * tools/build-skill-graph.mjs — never edited by hand.
 */
final class Skill extends Model
{
    // No factory, on purpose. Skills come from content/, which tools/ validates for
    // topological order, cycles and misconception coverage before anything is seeded. A
    // fabricated skill in a test would pass against a graph shape the real content can
    // never take, and the test would be proving nothing.

    protected $fillable = [
        'subject_id', 'code', 'name_ar', 'description_ar', 'strand',
        'grade_level', 'order_index', 'depth', 'mastery_threshold', 'is_spine',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'grade_level' => 'integer',
            'order_index' => 'integer',
            'depth' => 'integer',
            'mastery_threshold' => 'integer',
            'is_spine' => 'boolean',
        ];
    }

    /** @return BelongsTo<Subject, $this> */
    public function subject(): BelongsTo
    {
        return $this->belongsTo(Subject::class);
    }

    /** @return BelongsToMany<Skill, $this> */
    public function prerequisites(): BelongsToMany
    {
        return $this->belongsToMany(
            self::class,
            'skill_prerequisites',
            'skill_id',
            'prerequisite_skill_id',
        );
    }

    /** Skills that require this one — used to unlock the next step after mastery. */
    /** @return BelongsToMany<Skill, $this> */
    public function dependents(): BelongsToMany
    {
        return $this->belongsToMany(
            self::class,
            'skill_prerequisites',
            'prerequisite_skill_id',
            'skill_id',
        );
    }

    /** @return HasMany<Question, $this> */
    public function questions(): HasMany
    {
        return $this->hasMany(Question::class);
    }

    /** @return HasMany<Misconception, $this> */
    public function misconceptions(): HasMany
    {
        return $this->hasMany(Misconception::class);
    }

    /**
     * The diagnostic's search space: everything at or below the student's grade, in topological
     * order. A child cannot reasonably be expected to know above-grade content, and probing there
     * would spend questions to learn nothing.
     *
     * @param  Builder<Skill>  $query
     */
    public function scopeCandidatesForGrade(Builder $query, int $grade): void
    {
        $query->where('grade_level', '<=', $grade)->orderBy('order_index');
    }
}
