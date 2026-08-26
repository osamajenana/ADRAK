import type { GraphSkill, MasteryStatus } from './types';

/**
 * Builds the ordered list of skills a student must rebuild to reach a target.
 *
 * Everything the target depends on, minus what they already own, in prerequisite order. Ordering by
 * order_index is what guarantees a student is never handed a skill before its prerequisites — the
 * topological property is inherited from the graph build, not recomputed here.
 *
 * @see engine-spec/SPEC.md#4
 */
export function recoveryPath(
  graph: readonly GraphSkill[],
  statuses: Readonly<Record<string, MasteryStatus | string>>,
  target: string,
): string[] {
  const byCode = new Map(graph.map((s) => [s.code, s]));

  if (!byCode.has(target)) return [];

  const needed = new Set<string>();

  const visit = (code: string): void => {
    if (needed.has(code)) return;
    needed.add(code);
    for (const prerequisite of byCode.get(code)?.prerequisites ?? []) visit(prerequisite);
  };

  visit(target);

  return [...needed]
    .filter((code) => (statuses[code] ?? 'not_started') !== 'mastered')
    .sort((a, b) => (byCode.get(a)?.order_index ?? 0) - (byCode.get(b)?.order_index ?? 0));
}
