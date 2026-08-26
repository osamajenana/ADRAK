<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('student_skills', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();

            // All of these are DERIVED from exercise_attempts by MasteryEngine. Stored so the
            // dashboards stay fast, recomputed on sync so the append-only log stays the truth.
            $table->decimal('mastery_score', 5, 2)->default(0);
            $table->decimal('theta', 8, 2)->default(1200);
            $table->unsignedSmallInteger('attempts')->default(0);
            $table->unsignedSmallInteger('correct_answers')->default(0);
            $table->unsignedSmallInteger('hard_correct')->default(0);
            $table->string('status', 16)->default('not_started');

            $table->timestamp('mastered_at')->nullable();
            $table->timestamp('next_review_at')->nullable();
            $table->unsignedTinyInteger('review_count')->default(0);
            $table->timestamps();

            $table->unique(['student_id', 'skill_id']);
            // Drives the teacher's smart groups: who is stuck on which skill.
            $table->index(['skill_id', 'status']);
            $table->index('next_review_at');
        });

        Schema::create('learning_paths', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('target_skill_id')->constrained('skills')->cascadeOnDelete();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index(['student_id', 'is_active']);
        });

        Schema::create('learning_path_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('learning_path_id')->constrained()->cascadeOnDelete();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->unsignedSmallInteger('order_index');
            $table->string('status', 16)->default('locked');

            $table->unique(['learning_path_id', 'skill_id']);
            $table->index(['learning_path_id', 'order_index']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('learning_path_items');
        Schema::dropIfExists('learning_paths');
        Schema::dropIfExists('student_skills');
    }
};
