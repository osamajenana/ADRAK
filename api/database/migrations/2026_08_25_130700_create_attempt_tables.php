<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The append-only record of every answered exercise. Everything on student_skills is derived from
 * this table, so a corrupted aggregate can always be rebuilt by replaying it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exercise_attempts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->foreignId('selected_option_id')->nullable()->constrained('question_options')->nullOnDelete();
            $table->boolean('is_correct');
            $table->string('difficulty_at_attempt', 8);

            // Denormalised from the chosen option so the misconception dashboard is one indexed
            // scan rather than a four-table join per tile.
            $table->foreignId('misconception_id')->nullable()->constrained()->nullOnDelete();

            $table->uuid('device_id')->nullable();

            // Per-device monotonic counter. This — not a timestamp — is what orders a student's
            // history. Shared phones in Gaza lose power for days and come back with the clock at
            // 1970 or 2099, so wall-clock ordering would scramble the record.
            $table->unsignedBigInteger('client_seq')->default(0);

            // Unix seconds, not a timestamp column: a device that reports the year 2099 must not
            // be able to throw a range error and reject a child's legitimate work.
            $table->unsignedBigInteger('client_created_at')->nullable();

            $table->timestamps();

            $table->index(['student_id', 'skill_id', 'id']);
            $table->index(['skill_id', 'misconception_id']);
            $table->index(['student_id', 'client_seq']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exercise_attempts');
    }
};
