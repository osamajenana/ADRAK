import React from 'react';
import { Series } from 'remotion';
import {
  S1Gap, S2Why, S3Diagnose, S4Path, S5Offline, S6Qr, S7Misconception, S8Field, S9End,
} from './Scenes';

/** 30fps. Each scene holds well past its last reveal — a frame the eye has not finished is a
 *  frame the viewer did not read. */
export const SCENES = [
  { C: S1Gap, frames: 240 },
  { C: S2Why, frames: 210 },
  { C: S3Diagnose, frames: 270 },
  { C: S4Path, frames: 210 },
  { C: S5Offline, frames: 330 },
  { C: S6Qr, frames: 270 },
  { C: S7Misconception, frames: 270 },
  { C: S8Field, frames: 270 },
  { C: S9End, frames: 270 },
] as const;

export const DURATION = SCENES.reduce((n, s) => n + s.frames, 0);

export const AdrakVideo: React.FC = () => (
  <Series>
    {SCENES.map(({ C: Comp, frames }, i) => (
      <Series.Sequence key={i} durationInFrames={frames}>
        <Comp />
      </Series.Sequence>
    ))}
  </Series>
);
