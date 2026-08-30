<?php

declare(strict_types=1);

use App\Http\Requests\StudentLoginRequest;
use App\Models\Classroom;
use Database\Seeders\DemoSeeder;

/**
 * The demo class code is hand-picked, so nothing generates it and nothing was checking it.
 *
 * It grew to seven characters when the project was renamed from `NABD` to `ADRAK`, and every layer
 * that enforces six stayed quiet: the input truncated to `ADRAK2`, the lookup answered "no class
 * with this code", and the code printed in the README, the deploy script and the competition
 * submission was one no judge could type.
 *
 * No database on purpose. This asserts a constant against the rule that governs it, which is the
 * whole of the bug, and costs nothing to keep in a suite that runs on a limited power budget.
 */
it('hands a judge a class code the login screen can actually accept', function (): void {
    $rule = collect((new StudentLoginRequest())->rules()['join_code'])
        ->first(fn (string $rule): bool => str_starts_with($rule, 'size:'));

    expect(DemoSeeder::JOIN_CODE)
        ->toHaveLength((int) str_replace('size:', '', (string) $rule))
        ->toHaveLength(strlen(Classroom::generateJoinCode()));
});
