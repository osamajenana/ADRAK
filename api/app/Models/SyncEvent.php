<?php

declare(strict_types=1);

namespace App\Models;

use Database\Factories\SyncEventFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One thing that happened on a device, recorded so it can be replayed on the server.
 *
 * `id` is a client-minted UUIDv7 and the primary key. The same event legitimately arrives twice —
 * the student's phone finds a signal, and separately the teacher scans their QR and uploads the
 * class batch — and the duplicate must be a no-op, not a second answer. That idempotency is the
 * whole reason the three-tier sync is safe to offer.
 */
final class SyncEvent extends Model
{
    /** @use HasFactory<SyncEventFactory> */
    use HasFactory;

    public const CHANNEL_CLOUD = 'cloud';

    public const CHANNEL_QR = 'qr';

    public const CHANNEL_FILE = 'file';

    public $incrementing = false;

    public $timestamps = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id', 'device_id', 'student_id', 'client_seq', 'type',
        'payload', 'client_created_at', 'server_received_at', 'channel',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'payload' => 'array',
            'client_seq' => 'integer',
            'client_created_at' => 'integer',
            'server_received_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Student, $this> */
    public function student(): BelongsTo
    {
        return $this->belongsTo(Student::class);
    }
}
