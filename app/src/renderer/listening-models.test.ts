import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { cached } from '../core/cached';
import { GruModel, type GruWeights } from '../core/gru';
import { NgramModel, type NgramJson } from '../core/ngram';
import type { NoteSink } from '../core/types';
import { buildListeningPairs, buildPlaybackSequence, generateAnswer, stimulusSeed } from './listening-session';
import { ListeningPlayer } from './listening-playback';

const load = (name: string) => JSON.parse(readFileSync(new URL(`../../../model/export/${name}.json`, import.meta.url), 'utf8'));
afterEach(() => vi.useRealTimers());

it('generates and plays all 20 real-model stimuli through NoteSink and repeats a warm GRU plan', async () => {
  const models = {
    ngram: cached(new NgramModel(load('ngram') as NgramJson)),
    gru: cached(new GruModel(load('gru_weights') as GruWeights)),
  };
  const pairs = buildListeningPairs(42);
  let completed = 0;
  for (const pair of pairs) {
    for (const model of ['ngram', 'gru'] as const) {
      const plan = await generateAnswer(models[model], pair.progression, pair.weirdness, stimulusSeed(pair.id));
      expect(plan.chords).toHaveLength(4);
      expect(plan.beatsPerChord).toBe(4);
      if (model === 'gru' && pair === pairs[0]) {
        expect(await generateAnswer(models.gru, pair.progression, pair.weirdness, stimulusSeed(pair.id))).toEqual(plan);
      }
      const sequence = buildPlaybackSequence(pair, plan);
      const held = new Set<number>();
      const played: number[] = [];
      const sink: NoteSink = {
        name: 'recording', close: () => {},
        send: (pitch, velocity) => {
          expect(Number.isInteger(pitch) && pitch >= 0 && pitch <= 127).toBe(true);
          if (velocity) { held.add(pitch); played.push(pitch); } else held.delete(pitch);
        },
      };
      vi.useFakeTimers();
      const onError = vi.fn();
      new ListeningPlayer().play(sink, sequence, 120, {
        onChord: () => {}, onComplete: () => completed++, onError,
      });
      vi.runAllTimers();
      expect(onError).not.toHaveBeenCalled();
      expect(played).toEqual(sequence.flatMap((chord) => chord.notes));
      expect(held.size).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
      vi.useRealTimers();
    }
  }
  expect(completed).toBe(20);
}, 30000);
