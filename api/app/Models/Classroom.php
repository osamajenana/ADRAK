<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\ClassroomFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

final class Classroom extends Model
{
    /** @use HasFactory<ClassroomFactory> */
    use HasFactory;

    /** Digits 0/1/2/5/6/8 and letters A/E/I/O/U/B/G/L/S/Z are all excluded — see generateJoinCode(). */
    private const CODE_ALPHABET = '3479CDFHJKMNPQRTVWXY';

    protected $fillable = ['teacher_id', 'name', 'join_code', 'grade'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['grade' => 'integer'];
    }

    /**
     * Six characters from a deliberately restricted alphabet.
     *
     * No vowels, so a code can never come out as an actual word. No 0/O, 1/I/L, 5/S, 8/B — the
     * pairs a ten-year-old confuses when a code is read aloud across a tent and copied onto a
     * cracked screen. Every glyph removed here is a support conversation that never happens.
     */
    public static function generateJoinCode(): string
    {
        $code = '';
        for ($i = 0; $i < 6; $i++) {
            $code .= self::CODE_ALPHABET[random_int(0, strlen(self::CODE_ALPHABET) - 1)];
        }

        return $code;
    }

    /** Retries on the (vanishingly unlikely) collision rather than failing the request. */
    public static function generateUniqueJoinCode(): string
    {
        do {
            $code = self::generateJoinCode();
        } while (self::where('join_code', $code)->exists());

        return $code;
    }

    /** @return BelongsTo<User, $this> */
    public function teacher(): BelongsTo
    {
        return $this->belongsTo(User::class, 'teacher_id');
    }

    /** @return HasMany<Student, $this> */
    public function students(): HasMany
    {
        return $this->hasMany(Student::class);
    }
}
