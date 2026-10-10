import { describe, expect, it } from 'vitest';
import { detectChord } from './chords';
import { NgramModel } from './ngram';
import { ngramJson } from './testdata';
import { suggest } from './suggest';

const model = new NgramModel(ngramJson);
const V: Record<string, number[]> = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62] };
const history = ['C', 'Am', 'F', 'G'].map((n) => detectChord(V[n])!);

describe('suggest', () => {
  it('gives 3 distinct, sensible chords after C Am F G', () => {
    const s = suggest(history, model, { weirdness: 0.1, genre: 'pop', lastVoicing: V.G });
    expect(s).toHaveLength(3);
    expect(new Set(s.map((x) => x.name)).size).toBe(3);
    expect(s[0].name).toBe('C'); // back home after V
    expect(s.every((x) => !x.borrowed)).toBe(true);
    expect(s[0].prob).toBeGreaterThan(s[2].prob);
  });

  it('voices each suggestion near the last chord played', () => {
    const [c] = suggest(history, model, { weirdness: 0.1, genre: 'all', lastVoicing: V.G });
    expect(c.voicing).toEqual([55, 60, 64]); // G B D -> G C E
  });

  it('brings in borrowed chords when weird', () => {
    const s = suggest(history, model, { weirdness: 0.9, genre: 'all', lastVoicing: V.G });
    expect(s.some((x) => x.borrowed)).toBe(true);
  });

  it('returns nothing before the first chord', () => {
    expect(suggest([], model, { weirdness: 0.5, genre: 'all' })).toEqual([]);
  });

  it('takes well under 50 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 50; i++) suggest(history, model, { weirdness: i / 50, genre: 'rock', lastVoicing: V.G });
    expect((performance.now() - t0) / 50).toBeLessThan(50);
  });
});
