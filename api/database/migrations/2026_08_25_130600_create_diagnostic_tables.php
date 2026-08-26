<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('diagnostic_tests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('student_id')->constrained()->cascadeOnDelete();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->string('status', 16)->default('in_progress');
            $table->unsignedTinyInteger('grade_at_start');

            // The binary-search bounds, persisted so a sitting survives a dead battery mid-test.
            $table->smallInteger('lo')->default(-1);
            $table->smallInteger('hi')->default(0);
            $table->unsignedTinyInteger('asked')->default(0);

            $table->unsignedTinyInteger('estimated_level')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index(['student_id', 'status']);
        });

        Schema::create('diagnostic_answers', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('diagnostic_test_id')->constrained()->cascadeOnDelete();
            $table->foreignId('question_id')->constrained()->cascadeOnDelete();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->foreignId('selected_option_id')->nullable()->constrained('question_options')->nullOnDelete();
            $table->boolean('is_correct');

            // Which probe of the walk this answer belonged to — lets the whole search be replayed.
            $table->unsignedTinyInteger('probe_step');

            $table->timestamps();

            $table->index(['diagnostic_test_id', 'probe_step']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('diagnostic_answers');
        Schema::dropIfExists('diagnostic_tests');
    }
};
