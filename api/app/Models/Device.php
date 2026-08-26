<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\DeviceFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A phone or tablet a student works on. Often shared, often not theirs.
 *
 * `last_client_seq` is what the client resumes from, so a sync cut off by a dropped signal picks
 * up where it stopped instead of replaying a month of work over a 2G connection.
 */
final class Device extends Model
{
    /** @use HasFactory<DeviceFactory> */
    use HasFactory, HasUuids;

    protected $fillable = ['id', 'student_id', 'label', 'last_client_seq', 'last_seen_at'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['last_client_seq' => 'integer', 'last_seen_at' => 'datetime'];
    }

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
