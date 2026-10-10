import { describe, expect, it } from 'vitest';
import { NgramModel } from './ngram';
import { ngramJson } from './testdata';
import { VOCAB_SIZE } from './vocab';

// Expected top-3 (token, probability) computed with Predictor in model/build_ngram.py.
const cases: [string, number[], [number, number][]][] = [
  ['all', [1, 2], [[74, 0.281099], [56, 0.194197], [93, 0.090397]]],
  ['pop', [1, 2, 56], [[74, 0.448185], [29, 0.173624], [48, 0.134469]]],
  ['jazz', [1, 3, 63, 61], [[56, 0.358786], [62, 0.214685], [61, 0.0811]]],
  ['electronic', [82, 64], [[56, 0.175411], [46, 0.133256], [82, 0.116914]]],
  ['rock', [1], [[74, 0.16961], [56, 0.157678], [101, 0.107346]]],
];

describe('NgramModel', () => {
  const model = new NgramModel(ngramJson);

  it.each(cases)('matches the Python predictor (%s %j)', (genre, ctx, expected) => {
    const p = model.predictNext(ctx, genre);
    expect(p.length).toBe(VOCAB_SIZE);
    const top = [...p.keys()].sort((a, b) => p[b] - p[a]).slice(0, 3);
    expect(top).toEqual(expected.map(([t]) => t));
    expected.forEach(([t, prob]) => expect(p[t]).toBeCloseTo(prob, 4));
  });

  it('returns a distribution with zero mass on special tokens', () => {
    const p = model.predictNext([1, 2, 56], 'all');
    expect(p.slice(0, 11).every((x) => x === 0)).toBe(true);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('falls back to "all" for an unknown genre', () => {
    expect(model.predictNext([1, 2], 'polka')).toEqual(model.predictNext([1, 2], 'all'));
  });

  it('predicts in well under 5 ms', () => {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) model.predictNext([1, 2, 11 + ((i * 7) % 108)], i % 2 ? 'pop' : 'all');
    expect((performance.now() - t0) / 200).toBeLessThan(5);
  });
});
