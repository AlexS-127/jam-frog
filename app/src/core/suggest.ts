import { chordName } from './chords';
import { estimateKey, isBorrowed } from './key';
import type { ChordModel } from './model';
import { ranked, reshape } from './sampler';
import type { ChordSymbol, Suggestion } from './types';
import { BOS, decode, encode } from './vocab';
import { voiceNearPlayer } from './voicing';

export interface SuggestOptions {
  weirdness: number;
  genre: string;
  /** MIDI notes of the player's last chord, so the mini keyboards show something close by */
  lastVoicing?: number[];
}

/** How many past chords go into the model context (the GRU uses up to 8). */
export const CONTEXT_CHORDS = 8;

const priors = new WeakMap<ChordModel, Map<string, Float32Array>>();

/** Context-free distribution: the n-gram backs off to its unigram here. */
export function priorFor(model: ChordModel, genre: string): Float32Array {
  let byGenre = priors.get(model);
  if (!byGenre) priors.set(model, (byGenre = new Map()));
  const key = `${model.name}|${genre}`; // name too: a switchable model wrapper keeps one identity
  let p = byGenre.get(key);
  if (!p) byGenre.set(key, (p = model.predictNext([BOS], genre)));
  return p;
}

/** The 3 best distinct next chords after weirdness reshaping. */
export function suggest(history: ChordSymbol[], model: ChordModel, o: SuggestOptions): Suggestion[] {
  if (history.length === 0) return [];
  const recent = history.slice(-CONTEXT_CHORDS);
  const prev = recent[recent.length - 1];
  const key = estimateKey(history);
  const probs = model.predictNext(encode(recent), o.genre);
  const dist = reshape(probs, { weirdness: o.weirdness, prev, key, prior: priorFor(model, o.genre) });
  return ranked(dist)
    .slice(0, 3)
    .map((t) => {
      const chord = decode(prev.root, t)!;
      return {
        chord,
        name: chordName(chord.root, chord.quality),
        voicing: voiceNearPlayer(chord, o.lastVoicing ?? []),
        prob: dist[t],
        borrowed: isBorrowed(chord, key),
      };
    });
}
