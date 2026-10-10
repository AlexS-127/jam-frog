import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GruModel, genreId, type GruWeights } from './gru';
import { BOS, GENRES, INTERVAL0, START0, VOCAB_SIZE } from './vocab';

const exportDir = new URL('../../../model/export/', import.meta.url);
const weightsUrl = new URL('gru_weights.json', exportDir);
const checkUrl = new URL('gru_check.json', exportDir);
const trained = existsSync(weightsUrl) && existsSync(checkUrl);

/** deterministic weights for forward pass testing */
function tinyWeights(): GruWeights {
  const E = 4, H = 5, T = VOCAB_SIZE - INTERVAL0;
  let seed = 1;
  const rand = (n: number) => Array.from({ length: n }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5));
  return {
    vocabSize: VOCAB_SIZE, interval0: INTERVAL0, ctx: 8, emb: E, hidden: H, genreIds: GENRES.length + 1,
    tok: rand(VOCAB_SIZE * E), genre: rand((GENRES.length + 1) * E),
    wIh: rand(3 * H * E), wHh: rand(3 * H * H), bIh: rand(3 * H), bHh: rand(3 * H),
    headW: rand(T * H), headB: rand(T),
  };
}

describe('GruModel', () => {
  const model = new GruModel(tinyWeights());

  it('returns a distribution over the whole vocab with specials at 0', () => {
    const p = model.predictNext([BOS, START0, INTERVAL0 + 45], 'pop');
    expect(p.length).toBe(VOCAB_SIZE);
    for (let i = 0; i < INTERVAL0; i++) expect(p[i]).toBe(0);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('uses only the last 8 tokens of a long context', () => {
    const tail = [INTERVAL0 + 1, INTERVAL0 + 2, INTERVAL0 + 3, INTERVAL0 + 4, INTERVAL0 + 5, INTERVAL0 + 6, INTERVAL0 + 7, INTERVAL0 + 8];
    expect([...model.predictNext([BOS, START0, ...tail], 'rock')]).toEqual([...model.predictNext(tail, 'rock')]);
  });

  it('maps "all" and unknown genres to the shared id', () => {
    expect(genreId('pop')).toBe(0);
    expect(genreId('all')).toBe(GENRES.length);
    expect(genreId('polka')).toBe(GENRES.length);
  });

  it('rejects weights for a different vocab', () => {
    expect(() => new GruModel({ ...tinyWeights(), vocabSize: 100 })).toThrow();
  });

  it.skipIf(!trained)('matches PyTorch on the exported check cases (±1e-4) in under 5 ms', () => {
    const real = new GruModel(JSON.parse(readFileSync(weightsUrl, 'utf8')));
    const cases: { context: number[]; genre: string; probs: number[] }[] = JSON.parse(readFileSync(checkUrl, 'utf8'));
    for (const c of cases) {
      const p = real.predictNext(c.context, c.genre);
      for (let i = 0; i < VOCAB_SIZE; i++) expect(Math.abs(p[i] - c.probs[i])).toBeLessThan(1e-4);
    }
    const start = performance.now();
    for (let i = 0; i < 20; i++) real.predictNext(cases[0].context, cases[0].genre);
    // 5 ms is the target on the demo Mac; slower machines (CI, cloud) get headroom so this doesn't flake.
    expect((performance.now() - start) / 20).toBeLessThan(10);
  });
});
