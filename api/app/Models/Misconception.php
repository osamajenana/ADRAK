<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A named, systematic student error — "adds numerators and denominators" — with the wording a
 * teacher can act on.
 *
 * `catalogue` entries were authored up front. `discovered` entries were proposed by the AI pass
 * over real wrong-answer patterns and stay hidden from teachers until a human approves them.
 */
final class Misconception extends Model
{
    // No factory, on purpose. Misconceptions come from content/, which tools/ validates for
    // topological order, cycles and misconception coverage before anything is seeded. A
    // fabricated misconception in a test would pass against a graph shape the real content can
    // never take, and the test would be proving nothing.

    public const SOURCE_CATALOGUE = 'catalogue';

    public const SOURCE_DISCOVERED = 'discovered';

    public const STATUS_ACTIVE = 'active';

    public const STATUS_PROPOSED = 'proposed';

    public const STATUS_REJECTED = 'rejected';

    protected $fillable = ['skill_id', 'tag', 'name_ar', 'remediation_ar', 'source', 'status'];

    /** @return BelongsTo<Skill, $this> */
    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    /**
     * Only approved misconceptions reach a teacher. An unreviewed AI proposal shown as fact would
     * be exactly the kind of unaccountable automation this product refuses.
     *
     * @param  Builder<Misconception>  $query
     */
    public function scopeActive(Builder $query): void
    {
        $query->where('status', self::STATUS_ACTIVE);
    }
}
