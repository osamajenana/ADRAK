<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Misconception;
use App\Models\User;
use App\Services\Discovery\MisconceptionDiscoveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * The human half of misconception discovery.
 *
 * A model can read a pattern in mathematics and name the misunderstanding behind it. It cannot be
 * accountable for what a teacher then says to a child, so nothing it produces is visible to a
 * teacher until someone here has agreed with it.
 *
 * That is not caution for its own sake. A plausible-sounding wrong explanation is worse than no
 * explanation: a teacher who acts on it spends twenty minutes teaching against a misconception the
 * class does not have, and loses a little faith in every number on the screen afterwards.
 */
final class MisconceptionReviewController extends Controller
{
    public function __construct(private readonly MisconceptionDiscoveryService $discovery) {}

    /** Everything waiting for a decision, with the evidence that produced it. */
    public function index(): JsonResponse
    {
        $this->admin();

        $proposals = Misconception::query()
            ->where('status', Misconception::STATUS_PROPOSED)
            ->with('skill:id,code,name_ar')
            ->orderByDesc('id')
            ->get();

        return response()->json([
            'proposals' => $proposals->map(static fn (Misconception $m): array => [
                'id' => $m->id,
                'tag' => $m->tag,
                'name_ar' => $m->name_ar,
                'remediation_ar' => $m->remediation_ar,
                'source' => $m->source,
                'skill' => [
                    'code' => $m->skill->code,
                    'name_ar' => $m->skill->name_ar,
                ],
            ])->all(),
        ]);
    }

    /**
     * Approves a proposal and re-tags the history behind it.
     *
     * `chosen_answer` is required because the proposal describes an error, and the error is only
     * connected to real attempts through the specific wrong answer it produces. Approving without
     * it would activate a misconception that describes nothing.
     */
    public function approve(Request $request, Misconception $misconception): JsonResponse
    {
        $this->admin();

        $validated = $request->validate([
            'chosen_answer' => ['required', 'string', 'max:255'],
        ]);

        $retagged = $this->discovery->approve($misconception, $validated['chosen_answer']);

        return response()->json([
            'status' => $misconception->fresh()->status,
            // Without back-tagging an approval would describe only future answers, and a teacher
            // would see a count of one on something a class has been doing all term.
            'retagged_attempts' => $retagged,
        ]);
    }

    public function reject(Misconception $misconception): JsonResponse
    {
        $this->admin();

        $this->discovery->reject($misconception);

        return response()->json(['status' => $misconception->fresh()->status]);
    }

    private function admin(): User
    {
        $account = Auth::guard('sanctum')->user();

        abort_unless($account instanceof User && $account->isAdmin(), 403, 'هذه الواجهة للمشرفين.');

        return $account;
    }
}
