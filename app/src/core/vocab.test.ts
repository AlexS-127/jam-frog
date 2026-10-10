import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QUALITIES } from './types';
import { BOS, decode, encode, GENRES, INTERVAL0, START0, VOCAB_SIZE } from './vocab';

const vocab = JSON.parse(readFileSync(new URL('../../../model/export/vocab.json', import.meta.url), 'utf8'));

describe('vocab', () => {
  it('matches model/export/vocab.json', () => {
    expect(VOCAB_SIZE).toBe(vocab.size);
    expect(START0).toBe(vocab.start0);
    expect(INTERVAL0).toBe(vocab.interval0);
    expect([...QUALITIES]).toEqual(vocab.qualities);
    expect([...GENRES]).toEqual(vocab.genres);
  });

  it('encodes C -> F -> G7 and decodes back', () => {
    const chords = [
      { root: 0, quality: 'maj' as const },
      { root: 5, quality: 'maj' as const },
      { root: 7, quality: 'dom7' as const },
    ];
    const toks = encode(chords);
    // same tokens model/prepare.py writes: F is +5 maj, G7 is +2 dom7
    expect(toks).toEqual([BOS, START0 + 0, INTERVAL0 + 5 * 9 + 0, INTERVAL0 + 2 * 9 + 5]);
    expect(decode(0, toks[2])).toEqual(chords[1]);
    expect(decode(5, toks[3])).toEqual(chords[2]);
    expect(decode(0, BOS)).toBeNull();
  });
});
