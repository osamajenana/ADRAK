<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The sync spine.
 *
 * The same event can legitimately arrive twice by different routes: a student's own phone finds a
 * signal, and separately their teacher scans the QR and uploads the class batch. `id` is a
 * client-minted UUIDv7 and the primary key, so the second arrival is a no-op instead of a
 * duplicated answer. Idempotency is what makes the three-tier sync safe.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('devices', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->foreignId('student_id')->nullable()->constrained()->nullOnDelete();
            $table->string('label')->nullable();

            // How many of this device's events the server has accepted. The client resumes from
            // here, so a sync interrupted by a dropped signal never replays from zero.
            $table->unsignedBigInteger('last_client_seq')->default(0);

            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index('student_id');
        });

        Schema::create('sync_events', function (Blueprint $table): void {
            // Client-minted UUIDv7: time-ordered, so the primary-key index stays append-friendly
            // instead of scattering writes the way UUIDv4 would.
            $table->uuid('id')->primary();

            $table->uuid('device_id');
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('client_seq');
            $table->string('type', 32);
            $table->json('payload');

            $table->unsignedBigInteger('client_created_at')->nullable();
            $table->timestamp('server_received_at')->useCurrent();

            // The route the event travelled. Worth knowing: it tells the field team how much of a
            // class actually syncs by QR versus by their own connection.
            $table->string('channel', 16)->default('cloud');

            $table->index(['student_id', 'client_seq']);
            $table->index(['device_id', 'client_seq']);
            $table->index('server_received_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sync_events');
        Schema::dropIfExists('devices');
    }
};
