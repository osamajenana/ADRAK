<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Subject extends Model
{
    // No factory, on purpose. Subjects come from content/, which tools/ validates for
    // topological order, cycles and misconception coverage before anything is seeded. A
    // fabricated subject in a test would pass against a graph shape the real content can
    // never take, and the test would be proving nothing.

    protected $fillable = ['code', 'name_ar', 'name_en'];

    /** @return HasMany<Skill, $this> */
    public function skills(): HasMany
    {
        return $this->hasMany(Skill::class);
    }
}
