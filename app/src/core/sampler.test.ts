import { describe, expect, it } from 'vitest';
import { ranked, reshape, sampleToken } from './sampler';
import { decode, INTERVAL0, intervalToken, VOCAB_SIZE } from './vocab';

const C = { root: 0, quality: 'maj' as const };
const keyC = { tonic: 0, minor: false };

// A made-up model output after C: G 40%, F 30%, Am 15%, Bb (bVII, borrowed) 2%, C (repeat) 5%, rest spread thin.
function probs(): Float32Array {
  const p = new Float32Array(VOCAB_SIZE);
  for (let t = INTERVAL0; t < VOCAB_SIZE; t++) p[t] = 0.08 / 103;
  p[intervalToken(0, { root: 7, quality: 'maj' })] = 0.4;
  p[intervalToken(0, { root: 5, quality: 'maj' })] = 0.3;
  p[intervalToken(0, { root: 9, quality: 'min' })] = 0.15;
  p[intervalToken(0, { root: 10, quality: 'maj' })] = 0.02;
  p[intervalToken(0, C)] = 0.05;
  return p;
}
const names = (dist: Float32Array) =>
  ranked(dist).slice(0, 3).map((t) => { const c = decode(0, t)!; return `${c.root}:${c.quality}`; });

describe('reshape', () => {
  it('ranks by probability at low weirdness and keeps only a few', () => {
    const d = reshape(probs(), { weirdness: 0.1, prev: C, key: keyC });
    expect(names(d)).toEqual(['7:maj', '5:maj', '9:min']);
    expect(ranked(d).length).toBeLessThanOrEqual(5);
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('never suggests repeating the chord just played', () => {
    const d = reshape(probs(), { weirdness: 0.5, prev: C, key: keyC });
    expect(d[intervalToken(0, C)]).toBe(0);
  });

  it('pushes the borrowed bVII up the ranking at high weirdness', () => {
    const rank = (w: number) =>
      ranked(reshape(probs(), { weirdness: w, prev: C, key: keyC })).indexOf(intervalToken(0, { root: 10, quality: 'maj' }));
    expect(rank(0.1)).toBe(3); // 4th, behind G, F and Am
    expect(rank(0.9)).toBeGreaterThanOrEqual(0);
    expect(rank(0.9)).toBeLessThan(3); // now in the top 3 suggestions
  });

  it('flattens the distribution as weirdness rises, but is never uniform', () => {
    const top = (w: number) => Math.max(...reshape(probs(), { weirdness: w, prev: C, key: keyC }));
    expect(top(0.9)).toBeLessThan(top(0.1));
    const d = reshape(probs(), { weirdness: 1, prev: C, key: keyC });
    const kept = ranked(d).map((t) => d[t]);
    expect(Math.max(...kept)).toBeGreaterThan(2 * Math.min(...kept));
  });
});

describe('sampleToken', () => {
  it('draws in proportion to the distribution', () => {
    const d = new Float32Array(VOCAB_SIZE);
    d[20] = 0.75;
    d[30] = 0.25;
    expect(sampleToken(d, () => 0.1)).toBe(20);
    expect(sampleToken(d, () => 0.8)).toBe(30);
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const counts = { 20: 0, 30: 0 } as Record<number, number>;
    for (let i = 0; i < 4000; i++) counts[sampleToken(d, rng)]++;
    expect(counts[20] / 4000).toBeGreaterThan(0.7);
    expect(counts[20] / 4000).toBeLessThan(0.8);
  });
});
