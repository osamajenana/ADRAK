/**
 * Digit rendering.
 *
 * Content is stored in Western digits, which is what Palestinian mathematics textbooks use and what
 * every device renders consistently. Some students read Eastern Arabic numerals more fluently, so
 * the preference is a display-layer transform rather than a second copy of the content.
 *
 * Never applied to an `expression` that is being parsed or compared — only to what is drawn.
 */

const EASTERN = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export type DigitStyle = 'western' | 'eastern';

export function renderDigits(text: string, style: DigitStyle): string {
  if (style === 'western') return text;

  return text.replace(/[0-9]/g, (d) => EASTERN[Number(d)]);
}
