// design/tokens.json — the same palette the product ships. The video and the app cannot drift.
export const C = {
  ground: '#0A0F16',
  surface: '#121A24',
  raised: '#1B2634',
  line: '#28374A',
  ink: '#E9EFF6',
  muted: '#A3B2C4',
  subtle: '#7B8A9C',
  slate: '#6B7C90',
  brand: '#38C6BE',
  brandBright: '#71DED4',
  brandDeep: '#128884',
  amber: '#FBBF24',
  amberDeep: '#B45309',
} as const;

// 1920x1080. The layout minimums for a 1080-wide frame, scaled by 16/9.
export const T = {
  headline: 128,
  sub: 68,
  label: 44,
  mono: 40,
} as const;

export const SAFE = 170;
