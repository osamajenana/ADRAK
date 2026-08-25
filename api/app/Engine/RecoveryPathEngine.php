<?php

declare(strict_types=1);

namespace App\Engine;

/**
 * Builds the ordered list of skills a student must rebuild to reach a target.
 *
 * Everything the target depends on, minus what they already own, in prerequisite order. Ordering by
 * order_index is what guarantees a student is never handed a skill before its prerequisites — the
 * topological property is inherited from the graph build, not recomputed here.
 *
 * @see engine-spec/SPEC.md#4
 */
final class RecoveryPathEngine
{
    /**
     * @param  list<array{code: string, prerequisites: list<string>, order_index: int}>  $graph
     * @param  array<string, string>  $statuses  skill_code => not_started|learning|mastered;
     *                                           anything absent counts as not_started
     * @return list<string>
     */
    public static function build(array $graph, array $statuses, string $target): array
    {
        $byCode = [];
        foreach ($graph as $skill) {
            $byCode[$skill['code']] = $skill;
        }

        if (! isset($byCode[$target])) {
            return [];
        }

        $needed = [];
        $stack = [$target];
        while ($stack !== []) {
            $code = array_pop($stack);
            if (isset($needed[$code])) {
                continue;
            }
            $needed[$code] = true;
            foreach ($byCode[$code]['prerequisites'] ?? [] as $prerequisite) {
                if (! isset($needed[$prerequisite])) {
                    $stack[] = $prerequisite;
                }
            }
        }

        $mastered = MasteryStatus::Mastered->value;
        $pending = array_filter(
            array_keys($needed),
            static fn (string $code): bool => ($statuses[$code] ?? 'not_started') !== $mastered,
        );

        // usort() reindexes in place, so the result is already a list.
        usort(
            $pending,
            static fn (string $a, string $b): int => $byCode[$a]['order_index'] <=> $byCode[$b]['order_index'],
        );

        return $pending;
    }
}
