import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChordModel } from '../core/model';
import { BOS, INTERVAL0, VOCAB_SIZE, type Token } from '../core/vocab';
import {
  buildListeningPairs,
  buildPlaybackSequence,
  generateAnswer,
  makeRandom,
  PROGRESSIONS,
  stimulusSeed,
  summarizeVotes,
} from './listening-session';

const uniformModel: ChordModel = {
  name: 'uniform test model',
  predictNext: (_context: Token[]) => {
    const probabilities = new Float32Array(VOCAB_SIZE);
    for (let token = INTERVAL0; token < VOCAB_SIZE; token++) probabilities[token] = 1;
    return probabilities;
  },
};

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe('listening session setup', () => {
  it('builds ten shuffled pairs covering five progressions at both weirdness levels', () => {
    const pairs = buildListeningPairs(42);
    expect(pairs).toHaveLength(10);
    expect(new Set(pairs.map((pair) => pair.id)).size).toBe(10);
    expect([...new Set(pairs.map((pair) => pair.weirdness))].sort()).toEqual([0.1, 0.9]);
    expect(pairs.map((pair) => pair.progression.id).sort()).toEqual(
      [...PROGRESSIONS.flatMap((progression) => [progression.id, progression.id])].sort(),
    );
    for (const pair of pairs) {
      expect([pair.aModel, pair.bModel].sort()).toEqual(['gru', 'ngram']);
    }
    expect(buildListeningPairs(42).map((pair) => pair.id)).toEqual(pairs.map((pair) => pair.id));
  });

  it('provides a repeatable random stream and stimulus seed', () => {
    const left = makeRandom(stimulusSeed('c-am-f-g:0.1'));
    const right = makeRandom(stimulusSeed('c-am-f-g:0.1'));
    expect([left(), left(), left()]).toEqual([right(), right(), right()]);
  });

  it('generates a four-chord answer plan from the shared AnswerEngine', async () => {
    const progression = PROGRESSIONS[0];
    const first = await generateAnswer(uniformModel, progression, 0.1, 123);
    const second = await generateAnswer(uniformModel, progression, 0.1, 123);
    expect(first.chords).toHaveLength(4);
    expect(first.beatsPerChord).toBe(4);
    expect(first.chords.map((item) => [item.name, item.voicing])).toEqual(
      second.chords.map((item) => [item.name, item.voicing]),
    );
  });

  it('keeps the same candidate count and plan when model inference is slow', async () => {
    let clock = 0;
    let cost = 0;
    let calls = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    const model: ChordModel = {
      name: 'variable latency',
      predictNext: (context, genre) => {
        // The genre prior is cached separately from candidate predictions.
        if (context.length !== 1 || context[0] !== BOS) calls++;
        clock += cost;
        return uniformModel.predictNext(context, genre);
      },
    };
    const fast = await generateAnswer(model, PROGRESSIONS[0], 0.9, 123);
    const fastCalls = calls;
    calls = 0;
    cost = 100;
    const slow = await generateAnswer(model, PROGRESSIONS[0], 0.9, 123);
    expect(calls).toBe(fastCalls);
    expect(calls).toBe(48 * 4);
    expect(slow).toEqual(fast);
  });

  it('rejects model errors and clears engine timers', async () => {
    vi.useFakeTimers();
    const model: ChordModel = { name: 'broken', predictNext: () => { throw new Error('Inference failed'); } };
    const result = expect(generateAnswer(model, PROGRESSIONS[0], 0.1, 123)).rejects.toThrow('Inference failed');
    await vi.runAllTimersAsync();
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('plays four context chords followed by the four-bar answer plan', () => {
    const pair = buildListeningPairs(42)[0];
    const plan = {
      chords: Array.from({ length: 4 }, (_, index) => ({
        chord: { root: index, quality: 'maj' as const },
        name: `chord ${index}`,
        voicing: [60 + index, 64 + index, 67 + index],
      })),
      beatsPerChord: 4,
    };
    const sequence = buildPlaybackSequence(pair, plan);
    expect(sequence).toHaveLength(8);
    expect(sequence.slice(0, 4).map((item) => item.beats)).toEqual([4, 4, 4, 4]);
    expect(sequence.slice(4).map((item) => item.beats)).toEqual([4, 4, 4, 4]);
  });

  it('summarizes blind A/B votes by the revealed model and weirdness level', () => {
    const pairs = buildListeningPairs(7).slice(0, 3);
    const votes = new Map([
      [pairs[0].id, 'a' as const],
      [pairs[1].id, 'b' as const],
      [pairs[2].id, 'tie' as const],
    ]);
    const summary = summarizeVotes(pairs, votes);
    const firstWinner = pairs[0].aModel;
    const secondWinner = pairs[1].bModel;
    expect(summary[firstWinner].wins).toBeGreaterThanOrEqual(1);
    expect(summary[secondWinner].wins).toBeGreaterThanOrEqual(1);
    expect(summary.ties).toBe(1);
    expect(summary.ngram.wins + summary.gru.wins).toBe(2);
  });
});
