<?php

declare(strict_types=1);

namespace App\Models;

use App\Engine\Difficulty;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Question extends Model
{
    // No factory, on purpose. Questions come from content/, which tools/ validates for
    // topological order, cycles and misconception coverage before anything is seeded. A
    // fabricated question in a test would pass against a graph shape the real content can
    // never take, and the test would be proving nothing.

    protected $fillable = [
        'skill_id', 'type', 'difficulty', 'difficulty_elo',
        'stem_ar', 'expression', 'hint_ar', 'explanation_ar',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'difficulty' => Difficulty::class,
            'difficulty_elo' => 'float',
        ];
    }

    /** @return BelongsTo<Skill, $this> */
    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    /** @return HasMany<QuestionOption, $this> */
    public function options(): HasMany
    {
        return $this->hasMany(QuestionOption::class)->orderBy('position');
    }

    /** @param  Builder<Question>  $query */
    public function scopeOfDifficulty(Builder $query, Difficulty $difficulty): void
    {
        $query->where('difficulty', $difficulty->value);
    }
}
