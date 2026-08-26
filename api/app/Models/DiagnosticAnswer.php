<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\DiagnosticAnswerFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property bool $is_correct
 * @property int $probe_step
 * @property int $skill_id
 */
final class DiagnosticAnswer extends Model
{
    /** @use HasFactory<DiagnosticAnswerFactory> */
    use HasFactory;

    protected $fillable = [
        'diagnostic_test_id', 'question_id', 'skill_id',
        'selected_option_id', 'is_correct', 'probe_step',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['is_correct' => 'boolean', 'probe_step' => 'integer'];
    }

    /** @return BelongsTo<DiagnosticTest, $this> */
    public function diagnosticTest(): BelongsTo
    {
        return $this->belongsTo(DiagnosticTest::class);
    }

    /** @return BelongsTo<Skill, $this> */
    public function skill(): BelongsTo
    {
        return $this->belongsTo(Skill::class);
    }

    /** @return BelongsTo<Question, $this> */
    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class);
    }
}
