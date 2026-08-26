<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Skill;
use Illuminate\Support\Facades\Cache;

/**
 * Loads the skill graph in the plain-array shape the pure engines expect.
 *
 * The graph changes only when content/ is re-seeded, so it is cached rather than re-read per
 * request. Everything downstream — the diagnostic's search space, the recovery path's ordering —
 * reads it through here, which keeps the engines free of Eloquent.
 */
final class SkillGraphService
{
    private const CACHE_KEY = 'nabd.skill-graph.v1';

    private const CACHE_TTL_SECONDS = 3600;

    /** @var list<array{code: string, id: int, order_index: int, grade_level: int, prerequisites: list<string>}>|null */
    private ?array $memo = null;

    /** @return list<array{code: string, id: int, order_index: int, grade_level: int, prerequisites: list<string>}> */
    public function all(): array
    {
        return $this->memo ??= Cache::remember(
            self::CACHE_KEY,
            self::CACHE_TTL_SECONDS,
            static function (): array {
                $skills = Skill::query()
                    ->with('prerequisites:id,code')
                    ->orderBy('order_index')
                    ->get(['id', 'code', 'order_index', 'grade_level']);

                return $skills->map(static fn (Skill $skill): array => [
                    'code' => $skill->code,
                    'id' => $skill->id,
                    'order_index' => $skill->order_index,
                    'grade_level' => $skill->grade_level,
                    'prerequisites' => $skill->prerequisites->pluck('code')->all(),
                ])->all();
            },
        );
    }

    /**
     * The diagnostic's search space: everything at or below the student's declared grade, in
     * topological order.
     *
     * Above-grade skills are excluded because probing there spends a question to learn something
     * we already assume — and this test has a budget of fifteen.
     *
     * @return list<string>
     */
    public function candidatesForGrade(int $grade): array
    {
        return array_values(array_map(
            static fn (array $skill): string => $skill['code'],
            array_filter($this->all(), static fn (array $skill): bool => $skill['grade_level'] <= $grade),
        ));
    }

    /** @return array<string, int> code => grade_level */
    public function gradeLookup(): array
    {
        return array_column($this->all(), 'grade_level', 'code');
    }

    /** @return array<string, int> code => skill id */
    public function idLookup(): array
    {
        return array_column($this->all(), 'id', 'code');
    }

    public function forget(): void
    {
        $this->memo = null;
        Cache::forget(self::CACHE_KEY);
    }
}
