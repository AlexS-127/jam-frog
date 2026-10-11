import { describe, expect, it } from 'vitest';
import { estimateKey, isBorrowed, KeyTracker, keyName } from './key';
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

describe('estimateKey over a whole session', () => {
  it('follows a modulation: recent phrases outweigh older ones', () => {
    const inC = prog('C Am F G C Am F G C Am F G');
    const inG = prog('G Em C D G Em C D');
    const starts = [0, 4, 8, 12, 16];
    expect(estimateKey(inC, { phraseStarts: [0, 4, 8] })).toEqual({ tonic: 0, minor: false });
    expect(estimateKey([...inC, ...inG], { phraseStarts: starts })).toEqual({ tonic: 7, minor: false });
  });

  it('a long session keeps an ambiguous new phrase in the established key', () => {
    // F G Am alone could be A minor; after phrases in C, it reads as C
    const session = [...prog('C F G C C Am F G'), ...prog('F G Am')];
    expect(estimateKey(session, { phraseStarts: [0, 4, 8] })).toEqual({ tonic: 0, minor: false });
  });

  it('uses phrase-opening chords as tonic cues', () => {
    // Am C G F as phrases starting on Am -> A minor; the same chords phrased from C -> C major
    const chords = prog('Am C G F Am C G F');
    expect(estimateKey(chords, { phraseStarts: [0, 4] })).toEqual({ tonic: 9, minor: true });
    const fromC = prog('C G F Am C G F Am');
    expect(estimateKey(fromC, { phraseStarts: [0, 4] })).toEqual({ tonic: 0, minor: false });
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

describe('KeyTracker', () => {
  const C = { tonic: 0, minor: false };
  const G = { tonic: 7, minor: false };
  it('takes the first estimate, then changes only after 3 in a row agree', () => {
    const t = new KeyTracker();
    expect(t.update(C)).toBeNull();
    expect(t.key).toEqual(C);
    expect(t.update(G)).toBeNull();
    expect(t.update(C)).toBeNull(); // a passing chord: back home, nothing changes
    expect(t.update(G)).toBeNull();
    expect(t.update(G)).toBeNull();
    expect(t.update(G)).toEqual(C); // the change, from C
    expect(t.key).toEqual(G);
  });
  it('names keys', () => {
    expect(keyName({ tonic: 10, minor: false })).toBe('B♭ major');
    expect(keyName({ tonic: 6, minor: true })).toBe('F♯ minor');
  });
});
