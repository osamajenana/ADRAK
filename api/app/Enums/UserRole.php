<?php

declare(strict_types=1);

namespace App\Enums;

/**
 * Staff roles. Students are not here — they are a separate model with no email and no password,
 * so they never pass through this enum.
 *
 * Three fixed roles do not need a permissions package. Native enum plus Laravel policies covers
 * it, and every avoided dependency is a real download saved on a Gaza connection.
 */
enum UserRole: string
{
    case Teacher = 'teacher';
    case Admin = 'admin';

    public function labelAr(): string
    {
        return match ($this) {
            self::Teacher => 'معلّم',
            self::Admin => 'مشرف',
        };
    }
}
