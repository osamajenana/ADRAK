<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\StudentFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

/**
 * A student is authenticatable in its own right, separate from `users`.
 *
 * That separation is the point: `users` carries an email and a password because staff need them;
 * a child gets a first name, a grade and a class. No surname, no contact details, no photo, no
 * location. In a displacement setting the only data that cannot be misused is data never collected,
 * and keeping the two models apart makes that a schema guarantee rather than a promise.
 */
final class Student extends Authenticatable
{
    /** @use HasFactory<StudentFactory> */
    use HasApiTokens, HasFactory;

    protected $fillable = ['classroom_id', 'display_name', 'grade', 'pin_hash', 'login_token'];

    /** @var list<string> */
    protected $hidden = ['pin_hash', 'login_token'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'grade' => 'integer',
            'last_seen_at' => 'datetime',
            'pin_hash' => 'hashed',
        ];
    }

    /** Printed on the QR card a teacher hands out, so logging in is holding up a card. */
    public static function generateLoginToken(): string
    {
        return Str::random(48);
    }

    /** @return BelongsTo<Classroom, $this> */
    public function classroom(): BelongsTo
    {
        return $this->belongsTo(Classroom::class);
    }

    /** @return HasMany<StudentSkill, $this> */
    public function skills(): HasMany
    {
        return $this->hasMany(StudentSkill::class);
    }

    /** @return HasMany<ExerciseAttempt, $this> */
    public function attempts(): HasMany
    {
        return $this->hasMany(ExerciseAttempt::class);
    }

    /** @return HasMany<DiagnosticTest, $this> */
    public function diagnosticTests(): HasMany
    {
        return $this->hasMany(DiagnosticTest::class);
    }

    /** @return HasMany<LearningPath, $this> */
    public function learningPaths(): HasMany
    {
        return $this->hasMany(LearningPath::class);
    }
}
