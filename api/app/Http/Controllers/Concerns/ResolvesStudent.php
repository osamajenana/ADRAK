<?php

declare(strict_types=1);

namespace App\Http\Controllers\Concerns;

use App\Models\Student;
use Illuminate\Support\Facades\Auth;

/**
 * Resolves the authenticated account and insists it is a student.
 *
 * Goes through the guard rather than `$request->user()` deliberately. Sanctum's tokenable is
 * polymorphic — staff and students are different models sharing one token table — and
 * `$request->user()` is documented as returning the single configured auth model, so a check
 * against Student reads as impossible even though it is the normal case at runtime. The guard
 * returns an Authenticatable, which is what this actually is.
 */
trait ResolvesStudent
{
    protected function student(): Student
    {
        $account = Auth::guard('sanctum')->user();

        abort_unless($account instanceof Student, 403, 'هذه الواجهة للطلاب فقط.');

        return $account;
    }
}
