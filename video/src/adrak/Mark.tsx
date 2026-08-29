import React from 'react';
import { Img, staticFile } from 'remotion';

/**
 * The أدرك mark, used exactly as supplied — no redrawing, no recolouring, no reproportioning.
 *
 * The previous mark was drawn in SVG, so the film could animate it being made. This one is
 * supplied artwork at 210x125, so it appears instead of drawing: `appear` (0..1) fades and settles
 * it. Reconstructing it as paths in order to animate a stroke would mean redrawing someone else's
 * logo, which is not a licence this file has.
 */
export const Mark: React.FC<{ width: number; appear?: number }> = ({ width, appear = 1 }) => {
  const a = Math.max(0, Math.min(1, appear));

  return (
    <Img
      src={staticFile('adrak-mark.png')}
      style={{
        width,
        height: (width * 125) / 210,
        opacity: a,
        scale: 0.94 + 0.06 * a,
      }}
    />
  );
};
