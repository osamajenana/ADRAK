<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('classrooms', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('teacher_id')->constrained('users')->cascadeOnDelete();
            $table->string('name');
            // Short, human-readable, and said out loud in a tent with no printed roster.
            $table->string('join_code', 8)->unique();
            $table->unsignedTinyInteger('grade');
            $table->timestamps();

            $table->index(['teacher_id', 'grade']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('classrooms');
    }
};
