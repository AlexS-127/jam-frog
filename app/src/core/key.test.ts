import { describe, expect, it } from 'vitest';
import { estimateKey, isBorrowed } from './key';
import type { ChordSymbol, Quality } from './types';

const NAMES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// "Am" -> {root 9, min}, "E7" -> {root 4, dom7}, "Bb" -> {root 10, maj}
function parse(s: string): ChordSymbol {
  const m = /^([A-G])(b|#)?(m7|maj7|m|7|dim)?$/.exec(s)!;
  const root = (NAMES[m[1]] + (m[2] === 'b' ? 11 : m[2] === '#' ? 1 : 0)) % 12;
  const q: Record<string, Quality> = { '': 'maj', m: 'min', '7': 'dom7', m7: 'min7', maj7: 'maj7', dim: 'dim' };
  return { root, quality: q[m[3] ?? ''] };
}
const prog = (s: string) => s.split(' ').map(parse);

describe('estimateKey', () => {
  it.each([
    ['C Am F G', 0, false],
    ['Am F C G', 9, true],
    ['D A Bm G', 2, false],
    ['Em C G D', 4, true],
    ['C E7 Am F', 0, false],
    ['Dm7 G7 Cmaj7', 0, false],
  ])('%s', (p, tonic, minor) => {
    expect(estimateKey(prog(p))).toEqual({ tonic, minor });
  });
});

describe('isBorrowed', () => {
  const C = { tonic: 0, minor: false };
  it('knows bVI, bVII and iv in major', () => {
    expect(isBorrowed(parse('Ab'), C)).toBe(true);
    expect(isBorrowed(parse('Bb'), C)).toBe(true);
    expect(isBorrowed(parse('Fm'), C)).toBe(true);
  });
  it('does not count diatonic or unrelated chords', () => {
    expect(isBorrowed(parse('F'), C)).toBe(false);
    expect(isBorrowed(parse('G7'), C)).toBe(false);
    expect(isBorrowed(parse('E'), C)).toBe(false); // secondary dominant, not modal mixture
  });
  it('knows the major IV in minor', () => {
    expect(isBorrowed(parse('D'), { tonic: 9, minor: true })).toBe(true);
  });
});
