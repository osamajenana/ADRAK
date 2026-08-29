<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Everything ADRAK knows about a child: a first name, a grade, and which class they are in.
 *
 * No surname, no email, no phone, no photo, no location, no guardian contact. This is a deliberate
 * ceiling, not a stage we intend to grow out of: the data cannot leak, be subpoenaed or be used to
 * locate anyone if it was never collected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('students', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('classroom_id')->nullable()->constrained()->nullOnDelete();
            $table->string('display_name', 60);
            $table->unsignedTinyInteger('grade');

            // Four digits, hashed. Enough to keep five siblings out of each other's progress on a
            // shared phone; not pretending to be a security boundary against anything else.
            $table->string('pin_hash')->nullable();

            // Printed on a QR card the teacher hands out, so a child logs in by holding up a card
            // instead of typing a name they may not spell the same way twice.
            $table->string('login_token', 64)->unique();

            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            $table->index(['classroom_id', 'grade']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('students');
    }
};
