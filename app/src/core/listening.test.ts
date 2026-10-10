import { describe, expect, it } from 'vitest';
import { parseChordName } from './chords';
import { answerFor, buildCases, PROGRESSIONS, tally, voiceProgression } from './listening';
import type { ChordModel } from './model';
import { INTERVAL0, VOCAB_SIZE } from './vocab';

const fixed = (interval: number): ChordModel => ({
  name: `up${interval}`,
  predictNext: () => {
    const p = new Float32Array(VOCAB_SIZE);
    p[INTERVAL0 + interval * 9] = 1;
    return p;
  },
});

describe('listening test', () => {
  it('reads chord names', () => {
    expect(parseChordName('Am')).toEqual({ root: 9, quality: 'min' });
    expect(parseChordName('E7')).toEqual({ root: 4, quality: 'dom7' });
    expect(parseChordName('Bm')).toEqual({ root: 11, quality: 'min' });
    expect(parseChordName('F#m7')).toEqual({ root: 6, quality: 'min7' });
    expect(() => parseChordName('H')).toThrow();
  });

  it('voices every progression with smooth, playable chords', () => {
    for (const p of PROGRESSIONS) {
      const chords = voiceProgression(p);
      expect(chords.map((c) => c.name).join(' ')).toBe(p);
      for (const c of chords) expect(Math.min(...c.pitches)).toBeGreaterThanOrEqual(55);
    }
  });

  it('answers through the real engine, the same way each time for a seed', () => {
    const call = voiceProgression('C Am F G');
    const a = answerFor(call, fixed(5), 0.1, 42);
    expect(a.chords.map((c) => c.name)).toEqual(['C', 'F', 'Bb', 'Eb']); // always up a fourth from G
    expect(answerFor(call, fixed(5), 0.1, 42)).toEqual(a);
  });

  it('builds 5 progressions x 2 weirdness levels, each model once per case, in a shuffled order', () => {
    const cases = buildCases({ ngram: fixed(5), gru: fixed(7) }, 3);
    expect(cases).toHaveLength(10);
    for (const c of cases) expect(c.options.map((o) => o.model).sort()).toEqual(['gru', 'ngram']);
    const firstIsNgram = cases.filter((c) => c.options[0].model === 'ngram').length;
    expect(firstIsNgram).toBeGreaterThan(0); // not always the same order...
    expect(firstIsNgram).toBeLessThan(10);
    expect(buildCases({ ngram: fixed(5), gru: fixed(7) }, 3).map((c) => c.options[0].model))
      .toEqual(cases.map((c) => c.options[0].model)); // ...but reproducible
  });

  it('tallies blind votes back to the models', () => {
    const cases = buildCases({ ngram: fixed(5), gru: fixed(7) }, 3);
    const votes = new Map<string, number | 'tie'>();
    for (const c of cases) votes.set(c.id, c.options.findIndex((o) => o.model === 'gru'));
    votes.set(cases[0].id, 'tie');
    const t = tally(cases, votes);
    expect(t.overall).toEqual({ ngram: 0, gru: 9, tie: 1 });
    expect(t.byWeirdness['0.9'].gru).toBe(5);
    expect(t.voted).toBe(10);
  });
});
