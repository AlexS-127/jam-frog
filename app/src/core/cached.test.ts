import { describe, expect, it } from 'vitest';
import { cached } from './cached';
import type { ChordModel } from './model';

describe('cached', () => {
  it('asks the model once per context and genre', () => {
    let calls = 0;
    const m: ChordModel = { name: 'x', predictNext: () => (calls++, new Float32Array(3)) };
    const c = cached(m);
    c.predictNext([1, 2, 3], 'pop');
    c.predictNext([1, 2, 3], 'pop');
    c.predictNext([1, 2, 3], 'rock');
    c.predictNext([9, 1, 2, 3], 'pop'); // different (shorter than 8, so the whole context counts)
    expect(calls).toBe(3);
  });
});
