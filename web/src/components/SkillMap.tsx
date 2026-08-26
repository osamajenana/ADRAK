import { useMemo } from 'react';
import type { LocalSkill } from '@/db/schema';
import type { MasteryStatus } from '@/engine/types';

/**
 * The Skill Map.
 *
 * Hand-drawn SVG rather than a graph library. A layered DAG whose layer is already computed
 * server-side (`depth`) needs arithmetic, not a layout engine — and a layout library would cost
 * more than the entire student bundle is allowed to weigh.
 *
 * Laid out right to left, like the language: depth 0 sits on the right and the path runs leftward,
 * so "forward" on this map is forward in Arabic reading order.
 *
 * It is a PICTURE, not a control surface. Nothing here is clickable, and that is a decision rather
 * than an omission: a native button cannot exist inside SVG, so an interactive node would have to
 * be a `<g>` wearing role="button" — reachable in principle, second-class in practice for a screen
 * reader or a switch. Navigation lives beside the map as an ordinary HTML list of real buttons,
 * which every assistive technology already understands. The map's job is showing a student where
 * they are; the path's job is letting them move.
 */

const COLUMN = 132;
const ROW = 62;
const NODE_R = 13;
const PADDING = 28;

export interface SkillMapProps {
  skills: LocalSkill[];
  statuses: Record<string, MasteryStatus>;
  /** Codes on the active recovery path — these get the pulse. */
  pathCodes?: string[];
  currentCode?: string | null;
}

interface Node {
  skill: LocalSkill;
  x: number;
  y: number;
  status: MasteryStatus;
  onPath: boolean;
}

/** Spoken to a screen reader, because the node's meaning is otherwise carried only by colour. */
const STATUS_LABEL: Record<MasteryStatus, string> = {
  mastered: 'أتقنتها',
  learning: 'قيد التعلّم',
  not_started: 'لم تبدأ بعد',
};

const FILL: Record<MasteryStatus, string> = {
  mastered: 'var(--nabd-mastered)',
  learning: 'var(--nabd-learning)',
  not_started: 'var(--nabd-locked)',
};

export function SkillMap({ skills, statuses, pathCodes = [], currentCode }: SkillMapProps) {
  const { nodes, byCode, width, height } = useMemo(() => {
    const path = new Set(pathCodes);
    const perColumn = new Map<number, number>();
    const placed: Node[] = [];

    // Stable order in, stable layout out: the map must not reshuffle between visits, because a
    // student navigates it by remembering where things were.
    for (const skill of [...skills].sort((a, b) => a.order_index - b.order_index)) {
      const row = perColumn.get(skill.depth) ?? 0;
      perColumn.set(skill.depth, row + 1);

      placed.push({
        skill,
        x: PADDING + skill.depth * COLUMN,
        y: PADDING + row * ROW,
        status: statuses[skill.code] ?? 'not_started',
        onPath: path.has(skill.code),
      });
    }

    const lookup = new Map(placed.map((n) => [n.skill.code, n]));
    const maxDepth = Math.max(0, ...placed.map((n) => n.skill.depth));
    const maxRow = Math.max(1, ...perColumn.values());

    return {
      nodes: placed,
      byCode: lookup,
      width: PADDING * 2 + maxDepth * COLUMN + 120,
      height: PADDING * 2 + maxRow * ROW,
    };
  }, [skills, statuses, pathCodes]);

  return (
    <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-surface">
      <svg
        // Flipped horizontally so depth grows leftward. The nodes are un-flipped individually
        // below, otherwise every label would render mirrored.
        style={{ transform: 'scaleX(-1)' }}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="خريطة المهارات"
      >
        <title>خريطة المهارات</title>

        <g fill="none" strokeWidth={2}>
          {nodes.flatMap((node) =>
            node.skill.prerequisites.map((code) => {
              const from = byCode.get(code);
              if (!from) return null;

              const bothOnPath = node.onPath && from.onPath;
              const mid = (from.x + node.x) / 2;

              return (
                <path
                  key={`${code}->${node.skill.code}`}
                  d={`M ${from.x} ${from.y} C ${mid} ${from.y}, ${mid} ${node.y}, ${node.x} ${node.y}`}
                  stroke={
                    bothOnPath
                      ? 'var(--nabd-primary)'
                      : from.status === 'mastered'
                        ? 'var(--nabd-mastered)'
                        : 'var(--nabd-border)'
                  }
                  strokeOpacity={bothOnPath ? 0.9 : from.status === 'mastered' ? 0.45 : 0.35}
                  className={bothOnPath ? 'pulse' : undefined}
                />
              );
            }),
          )}
        </g>

        {nodes.map((node) => (
          <SkillNode
            key={node.skill.code}
            node={node}
            isCurrent={node.skill.code === currentCode}
          />
        ))}
      </svg>
    </div>
  );
}

/** One node. Purely visual — see the note on SkillMap for why nothing here is clickable. */
function SkillNode({ node, isCurrent }: { node: Node; isCurrent: boolean }) {
  // Un-flips the horizontal mirror applied to the whole canvas, so labels read the right way round.
  return (
    <g transform={`translate(${node.x} ${node.y}) scale(-1 1)`}>
      <title>{`${node.skill.name_ar} — ${STATUS_LABEL[node.status]}`}</title>

      {isCurrent && (
        <circle
          r={NODE_R + 7}
          fill="none"
          stroke="var(--nabd-primary)"
          strokeWidth={2}
          className="pulse"
        />
      )}

      <circle
        r={node.skill.is_spine ? NODE_R : NODE_R - 3}
        fill={FILL[node.status]}
        stroke={node.onPath ? 'var(--nabd-primary)' : 'transparent'}
        strokeWidth={2}
      />

      {/* A tick, not just a colour. Colour alone fails WCAG 1.4.1 and fails a colour-blind child
          entirely. */}
      {node.status === 'mastered' && (
        <path
          d="M -5 0 L -1.5 4 L 5.5 -4"
          fill="none"
          stroke="var(--nabd-mastered-fg)"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      <text
        x={0}
        y={NODE_R + 15}
        textAnchor="middle"
        fontSize={11}
        fill="var(--nabd-text-muted)"
        style={{ direction: 'rtl' }}
      >
        {node.skill.name_ar.length > 18
          ? `${node.skill.name_ar.slice(0, 17)}…`
          : node.skill.name_ar}
      </text>
    </g>
  );
}
