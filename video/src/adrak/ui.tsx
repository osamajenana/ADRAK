import React from 'react';
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, SAFE } from './theme';
import { fontFamily } from './fonts';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Full-frame scene ground. RTL, generous safe area, one centred column — never a dashboard. */
export const Scene: React.FC<{
  children: React.ReactNode;
  align?: 'center' | 'flex-start';
  gap?: number;
}> = ({ children, align = 'center', gap = 44 }) => (
  <AbsoluteFill
    style={{
      backgroundColor: C.ground,
      direction: 'rtl',
      fontFamily: `${fontFamily}, system-ui, sans-serif`,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: align,
      padding: SAFE,
      gap,
    }}
  >
    {children}
  </AbsoluteFill>
);

/** Fade-and-rise from a reserved layout slot. Nothing animates into space another element owns. */
export const Reveal: React.FC<{
  at?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at = 0, children, style }) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        opacity: interpolate(frame, [at, at + 16], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        }),
        translate: `0px ${interpolate(frame, [at, at + 22], [30, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: EASE,
        })}px`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

/** A horizontal rule standing in for a grade level — dashed for notional, solid for real. */
export const Level: React.FC<{
  width: number;
  color: string;
  dashed?: boolean;
  thickness?: number;
  grow?: number;
}> = ({ width, color, dashed = false, thickness = 6, grow = 1 }) => (
  <div
    style={{
      width: width * Math.max(0, Math.min(1, grow)),
      height: thickness,
      borderRadius: thickness,
      background: dashed
        ? `repeating-linear-gradient(90deg, ${color} 0 34px, transparent 34px 56px)`
        : color,
    }}
  />
);

export const Head: React.FC<{ children: React.ReactNode; size: number; color?: string }> = ({
  children,
  size,
  color = C.ink,
}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 700,
      color,
      lineHeight: 1.35,
      letterSpacing: '-0.01em',
      textAlign: 'center',
      maxWidth: 1500,
    }}
  >
    {children}
  </div>
);

export const Sub: React.FC<{ children: React.ReactNode; size: number; color?: string }> = ({
  children,
  size,
  color = C.muted,
}) => (
  <div
    style={{
      fontSize: size,
      fontWeight: 500,
      color,
      lineHeight: 1.6,
      textAlign: 'center',
      maxWidth: 1400,
    }}
  >
    {children}
  </div>
);
