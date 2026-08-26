/**
 * Base45, as specified in RFC 9285.
 *
 * QR codes have an alphanumeric mode covering exactly 45 characters, and it stores data at roughly
 * two-thirds the cost of byte mode. Base45 maps arbitrary bytes onto that alphabet, so a payload
 * encoded this way fits in a materially smaller symbol — which on a cracked phone screen held up
 * across a tent is the difference between a scan that works first time and one that does not.
 *
 * Written out rather than pulled in: it is forty lines, and every dependency is a real download on
 * the connection this app is built for.
 */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const VALUES: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((character, index) => [character, index]),
);

export function encodeBase45(bytes: Uint8Array): string {
  let out = '';

  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      // Two bytes become three characters.
      const value = bytes[i] * 256 + bytes[i + 1];
      out +=
        ALPHABET[value % 45] +
        ALPHABET[Math.floor(value / 45) % 45] +
        ALPHABET[Math.floor(value / 2025)];
    } else {
      // A trailing odd byte becomes two.
      const value = bytes[i];
      out += ALPHABET[value % 45] + ALPHABET[Math.floor(value / 45)];
    }
  }

  return out;
}

export function decodeBase45(text: string): Uint8Array<ArrayBuffer> {
  const digits = [...text].map((character) => {
    const value = VALUES[character];

    if (value === undefined) {
      throw new Error(`not base45: ${character}`);
    }

    return value;
  });

  const bytes: number[] = [];

  for (let i = 0; i < digits.length; i += 3) {
    if (i + 2 < digits.length) {
      const value = digits[i] + digits[i + 1] * 45 + digits[i + 2] * 2025;

      if (value > 0xffff) throw new Error('base45: chunk out of range');

      bytes.push(value >> 8, value & 0xff);
    } else if (i + 1 < digits.length) {
      const value = digits[i] + digits[i + 1] * 45;

      if (value > 0xff) throw new Error('base45: trailing chunk out of range');

      bytes.push(value);
    } else {
      throw new Error('base45: truncated input');
    }
  }

  return Uint8Array.from(bytes);
}
