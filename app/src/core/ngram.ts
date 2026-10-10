import type { ChordModel } from './model';
import { INTERVAL0, VOCAB_SIZE, type Token } from './vocab';

// TypeScript port of Predictor in model/build_ngram.py (interpolated absolute discounting):
//   P(w | a b) = max(c(a b w) - D, 0) / c(a b)  +  D * n(a b) / c(a b) * P(w | b)
//   P(w | b)   = same form, backing off to P(w) = (c(w) + 1) / (N + V)

type Entry = [total: number, distinct: number, flat: number[]];
interface OrderTables {
  uni: number[];
  bi: Record<string, Entry>;
  tri: Record<string, Entry>;
}
export interface NgramJson {
  vocabSize: number;
  interval0: number;
  discount: number;
  models: Record<string, OrderTables>;
}

interface Dense {
  disc: Float64Array;
  weight: number;
}

const N_TARGETS = VOCAB_SIZE - INTERVAL0;

class GenreModel {
  readonly pUni: Float64Array;
  private bi = new Map<string, Dense>();
  private tri = new Map<string, Dense>();

  constructor(private readonly t: OrderTables, private readonly d: number) {
    const total = t.uni.reduce((a, b) => a + b, 0);
    this.pUni = Float64Array.from(t.uni, (c) => (c + 1) / (total + N_TARGETS));
  }

  private dense(cache: Map<string, Dense>, table: Record<string, Entry>, key: string): Dense | null {
    let hit = cache.get(key);
    if (hit) return hit;
    const e = table[key];
    if (!e) return null;
    const [total, distinct, flat] = e;
    const disc = new Float64Array(N_TARGETS);
    for (let i = 0; i < flat.length; i += 2) disc[flat[i]] = Math.max(flat[i + 1] - this.d, 0) / total;
    hit = { disc, weight: (this.d * distinct) / total };
    cache.set(key, hit);
    return hit;
  }

  predict(ctx: Token[]): Float64Array {
    let p = this.pUni;
    const n = ctx.length;
    const layers: (Dense | null)[] = [
      n >= 1 ? this.dense(this.bi, this.t.bi, String(ctx[n - 1])) : null,
      n >= 2 ? this.dense(this.tri, this.t.tri, `${ctx[n - 2]},${ctx[n - 1]}`) : null,
    ];
    for (const layer of layers) {
      if (!layer) continue;
      const next = new Float64Array(N_TARGETS);
      for (let i = 0; i < N_TARGETS; i++) next[i] = layer.disc[i] + layer.weight * p[i];
      p = next;
    }
    return p;
  }
}

export class NgramModel implements ChordModel {
  readonly name = 'n-gram';
  private genres = new Map<string, GenreModel>();

  constructor(private readonly json: NgramJson) {
    if (json.vocabSize !== VOCAB_SIZE || json.interval0 !== INTERVAL0) {
      throw new Error('ngram.json does not match the app vocabulary; rebuild with model/build_ngram.py');
    }
  }

  private model(genre: string): GenreModel {
    const key = genre in this.json.models ? genre : 'all';
    let m = this.genres.get(key);
    if (!m) {
      m = new GenreModel(this.json.models[key], this.json.discount);
      this.genres.set(key, m);
    }
    return m;
  }

  predictNext(context: Token[], genre: string): Float32Array {
    const p = this.model(genre).predict(context);
    let sum = 0;
    for (let i = 0; i < p.length; i++) sum += p[i];
    const out = new Float32Array(VOCAB_SIZE);
    for (let i = 0; i < p.length; i++) out[INTERVAL0 + i] = p[i] / sum;
    return out;
  }
}
