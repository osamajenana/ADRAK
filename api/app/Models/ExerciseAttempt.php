<?php

declare(strict_types=1);

namespace App\Models;

use App\Engine\Attempt;
use App\Engine\Difficulty;
use Database\Factories\ExerciseAttemptFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * The append-only record of one answered exercise. Everything on student_skills derives from this.
 *
 * The @property lines declare what casts() produces. Static analysis cannot read an enum cast out
 * of that array, and toEngineAttempt() hands the value straight to a constructor that demands the
 * enum — so without these, the boundary between Eloquent and the pure engine is untyped exactly
 * where it matters most.
 *
 * @property bool $is_correct
 * @property Difficulty $difficulty_at_attempt
 * @property int $skill_id
 */
final class ExerciseAttempt extends Model
{
    /** @use HasFactory<ExerciseAttemptFactory> */
    use HasFactory;

    protected $fillable = [
        'student_id', 'question_id', 'skill_id', 'selected_option_id', 'is_correct',
        'difficulty_at_attempt', 'misconception_id', 'device_id', 'client_seq', 'client_created_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'is_correct' => 'boolean',
            'difficulty_at_attempt' => Difficulty::class,
            'client_seq' => 'integer',
            'client_created_at' => 'integer',
        ];
    }

    /** Hands this row to the pure engine, which knows nothing about Eloquent. */
    public function toEngineAttempt(): Attempt
    {
        return new Attempt($this->is_correct, $this->difficulty_at_attempt);
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

    /** @return BelongsTo<Question, $this> */
    public function question(): BelongsTo
    {
        return $this->belongsTo(Question::class);
    }

    /** @return BelongsTo<Misconception, $this> */
    public function misconception(): BelongsTo
    {
        return $this->belongsTo(Misconception::class);
    }
}
