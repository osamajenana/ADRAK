<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The skill graph, seeded from content/skill-graph.json.
 *
 * `order_index` is topological — every skill sorts after all of its prerequisites. Both the
 * diagnostic binary search and the recovery path depend on that property holding, and it is
 * computed by tools/build-skill-graph.mjs rather than maintained by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subjects', function (Blueprint $table): void {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('name_ar');
            $table->string('name_en');
            $table->timestamps();
        });

        Schema::create('skills', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('subject_id')->constrained()->cascadeOnDelete();
            $table->string('code', 32)->unique();
            $table->string('name_ar');
            $table->text('description_ar');
            $table->string('strand', 24);
            $table->unsignedTinyInteger('grade_level');

            // Position in the topological order. The search space for the diagnostic.
            $table->unsignedSmallInteger('order_index');

            // Longest path from a root. The Skill Map uses it as the layout layer.
            $table->unsignedTinyInteger('depth');

            $table->unsignedTinyInteger('mastery_threshold')->default(85);
            $table->boolean('is_spine')->default(false);
            $table->timestamps();

            $table->index(['subject_id', 'order_index']);
            $table->index(['grade_level', 'order_index']);
        });

        Schema::create('skill_prerequisites', function (Blueprint $table): void {
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->foreignId('prerequisite_skill_id')->constrained('skills')->cascadeOnDelete();

            $table->primary(['skill_id', 'prerequisite_skill_id']);
            $table->index('prerequisite_skill_id');
        });

        Schema::create('misconceptions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('skill_id')->constrained()->cascadeOnDelete();
            $table->string('tag', 64);
            $table->string('name_ar');
            $table->text('remediation_ar');

            // `catalogue` = authored up front. `discovered` = proposed by the AI pass over real
            // wrong-answer patterns, and not shown to teachers until a human approves it.
            $table->string('source', 16)->default('catalogue');
            $table->string('status', 16)->default('active');

            $table->timestamps();

            $table->unique(['skill_id', 'tag']);
            $table->index(['status', 'source']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('misconceptions');
        Schema::dropIfExists('skill_prerequisites');
        Schema::dropIfExists('skills');
        Schema::dropIfExists('subjects');
    }
};
