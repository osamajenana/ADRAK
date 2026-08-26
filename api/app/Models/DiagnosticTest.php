<?php

declare(strict_types=1);

namespace App\Models;

use App\Engine\DiagnosticState;
use Database\Factories\DiagnosticTestFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * One diagnostic sitting.
 *
 * The binary-search bounds live in columns rather than in a session, so a test survives a dead
 * battery halfway through — which in Gaza is the normal case, not the edge case.
 */
final class DiagnosticTest extends Model
{
    /** @use HasFactory<DiagnosticTestFactory> */
    use HasFactory;

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_COMPLETED = 'completed';

    protected $fillable = [
        'student_id', 'subject_id', 'status', 'grade_at_start',
        'lo', 'hi', 'asked', 'estimated_level', 'completed_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'grade_at_start' => 'integer',
            'lo' => 'integer',
            'hi' => 'integer',
            'asked' => 'integer',
            'estimated_level' => 'integer',
            'completed_at' => 'datetime',
        ];
    }

    /**
     * Rebuilds the pure engine state from the persisted row plus the probes recorded so far.
     *
     * @param  list<string>  $candidates
     * @param  list<array{skill_code: string, correct: int, total: int}>  $probes
     */
    public function toEngineState(array $candidates, array $probes): DiagnosticState
    {
        return new DiagnosticState(
            $this->grade_at_start,
            $candidates,
            $probes,
            $this->lo,
            $this->hi,
            $this->asked,
        );
    }

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }

    /** @return HasMany<DiagnosticAnswer, $this> */
    public function answers(): HasMany
    {
        return $this->hasMany(DiagnosticAnswer::class)->orderBy('probe_step')->orderBy('id');
    }
}
