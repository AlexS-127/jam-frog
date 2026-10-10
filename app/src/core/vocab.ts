import { QUALITIES, type ChordSymbol, type Quality } from './types';

// Token layout shared with the model (must match model/export/vocab.json, checked in vocab.test.ts).
//   0 PAD, 1 BOS, 2..10 START_<quality>, 11..118 interval tokens:
//   INTERVAL0 + ((root - prevRoot) mod 12) * 9 + quality

export type Token = number;

export const PAD = 0;
export const BOS = 1;
export const START0 = 2;
export const INTERVAL0 = START0 + QUALITIES.length;
export const VOCAB_SIZE = INTERVAL0 + 12 * QUALITIES.length;
export const GENRES = [
  'pop', 'rock', 'country', 'alternative', 'pop rock', 'punk',
  'metal', 'rap', 'soul', 'jazz', 'reggae', 'electronic',
] as const;

const qIndex = (q: Quality) => QUALITIES.indexOf(q);
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** Encode a chord sequence as model context: BOS, START_q, then intervals. */
export function encode(chords: ChordSymbol[]): Token[] {
  if (chords.length === 0) return [BOS];
  const out: Token[] = [BOS, START0 + qIndex(chords[0].quality)];
  for (let i = 1; i < chords.length; i++) {
    out.push(intervalToken(chords[i - 1].root, chords[i]));
  }
  return out;
}

export function intervalToken(prevRoot: number, next: ChordSymbol): Token {
  return INTERVAL0 + mod12(next.root - prevRoot) * QUALITIES.length + qIndex(next.quality);
}

/** The chord an interval token means, given the previous chord's root. null for specials. */
export function decode(prevRoot: number, token: Token): ChordSymbol | null {
  if (token < INTERVAL0 || token >= VOCAB_SIZE) return null;
  const i = token - INTERVAL0;
  return { root: mod12(prevRoot + Math.floor(i / QUALITIES.length)), quality: QUALITIES[i % QUALITIES.length] };
}
