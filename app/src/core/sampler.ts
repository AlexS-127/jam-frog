import { isBorrowed, type Key } from './key';
import type { ChordSymbol } from './types';
import { decode, INTERVAL0, VOCAB_SIZE, type Token } from './vocab';

export interface ReshapeOptions {
  /** 0..1 */
  weirdness: number;
  /** the chord the prediction follows */
  prev: ChordSymbol;
  key: Key;
  /** context-free distribution (e.g. model.predictNext([BOS])); rarer moves get a boost when weird */
  prior?: Float32Array;
}

/** How much the weird-only effects apply: 0 up to weirdness 0.3, then rising to 1 at weirdness 1. */
const weirdAmount = (w: number) => Math.max(0, (w - 0.3) / 0.7);

/**
 * Reshape model probabilities by weirdness. Never uniform:
 * - low weirdness: plain probability ranking, sharpened, top 4
 * - high weirdness: higher temperature, wider top-k, rare moves and borrowed chords (bVI, bVII, iv in major) boosted
 * Repeating the previous chord is excluded. Returns a distribution over the vocabulary (zeros elsewhere).
 */
export function reshape(probs: Float32Array, o: ReshapeOptions): Float32Array {
  const w = Math.min(1, Math.max(0, o.weirdness));
  const m = weirdAmount(w);
  const temperature = 0.6 + 1.6 * w;
  const k = Math.round(4 + 24 * w * w);
  const novelty = 0.8 * m;
  const borrowedBoost = Math.log(1 + 5 * m);

  const scored: { t: Token; s: number }[] = [];
  for (let t = INTERVAL0; t < VOCAB_SIZE; t++) {
    const p = probs[t];
    if (p <= 0) continue;
    const chord = decode(o.prev.root, t)!;
    if (chord.root === o.prev.root && chord.quality === o.prev.quality) continue;
    let s = Math.log(p);
    if (o.prior && o.prior[t] > 0) s -= novelty * Math.log(o.prior[t]);
    s /= temperature;
    if (isBorrowed(chord, o.key)) s += borrowedBoost;
    scored.push({ t, s });
  }
  scored.sort((a, b) => b.s - a.s);
  const kept = scored.slice(0, k);
  const out = new Float32Array(VOCAB_SIZE);
  if (kept.length === 0) return out;
  const max = kept[0].s;
  let sum = 0;
  for (const { t, s } of kept) sum += out[t] = Math.exp(s - max);
  for (const { t } of kept) out[t] /= sum;
  return out;
}

/** Tokens with non-zero mass, most likely first. */
export function ranked(dist: Float32Array): Token[] {
  return [...dist.keys()].filter((t) => dist[t] > 0).sort((a, b) => dist[b] - dist[a]);
}

/** Draw one token in proportion to `dist` (a reshaped distribution). */
export function sampleToken(dist: Float32Array, rng: () => number = Math.random): Token {
  const r = rng();
  let acc = 0;
  let last = -1;
  for (let t = 0; t < dist.length; t++) {
    if (dist[t] <= 0) continue;
    acc += dist[t];
    last = t;
    if (r < acc) return t;
  }
  return last;
}
