<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users` holds staff only — teachers and admins, who have an email and a password.
 *
 * Students deliberately do NOT live here. They get their own table with no email, no phone and no
 * password, because the least risky way to protect a child's data in a displacement setting is not
 * to collect it. See the students migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('role', 20)->default('teacher')->after('email');
            $table->string('school_name')->nullable()->after('role');
            $table->index('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['role']);
            $table->dropColumn(['role', 'school_name']);
        });
    }
};
