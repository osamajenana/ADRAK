import { loadFont } from '@remotion/google-fonts/IBMPlexSansArabic';

// The product's own face. Arabic subset is explicit — without it the glyphs fall back silently and
// the render ships in whatever the machine happened to have.
export const { fontFamily } = loadFont('normal', {
  weights: ['400', '500', '600', '700'],
  subsets: ['arabic', 'latin'],
});
