import type { ChordModel } from './model';
import { INTERVAL0, PAD, VOCAB_SIZE, type Token } from './vocab';

// TypeScript port of Predictor in model/build_ngram.py (interpolated absolute discounting):
//   P_k(w | h_k) = max(c(h_k w) - D, 0) / c(h_k)  +  D * n(h_k) / c(h_k) * P_{k-1}(w | h_{k-1})
//   P_0(w)       = (c(w) + 1) / (N + V)
// "all" has contexts up to maxContext tokens (a 5-gram); each genre has short contexts of its own
// and uses the shared long ones on top. Contexts are left-padded with PAD.

type Entry = [total: number, distinct: number, flat: number[]];
interface ModelTables {
  uni: number[];
  /** order (context length) -> "tok,tok,..." (oldest first) -> entry */
  ctx: Record<string, Record<string, Entry>>;
}
export interface NgramJson {
  vocabSize: number;
  interval0: number;
  pad: number;
  discount: number;
  maxContext: number;
  models: Record<string, ModelTables>;
}

interface Dense {
  disc: Float64Array;
  weight: number;
}

const N_TARGETS = VOCAB_SIZE - INTERVAL0;

class Chain {
  private readonly pUni: Float64Array;
  private readonly tables: Record<string, Entry>[] = [];
  private readonly cache = new Map<string, Dense | null>();

  constructor(own: ModelTables, shared: ModelTables, private readonly d: number, private readonly maxContext: number) {
    const total = own.uni.reduce((a, b) => a + b, 0);
    this.pUni = Float64Array.from(own.uni, (c) => (c + 1) / (total + N_TARGETS));
    for (let order = 1; order <= maxContext; order++) {
      this.tables.push((own.ctx[order] ?? shared.ctx[order]) || {});
    }
  }

  private dense(order: number, key: string): Dense | null {
    const ck = `${order}|${key}`;
    if (this.cache.has(ck)) return this.cache.get(ck)!;
    const e = this.tables[order - 1][key];
    let out: Dense | null = null;
    if (e) {
      const [total, distinct, flat] = e;
      const disc = new Float64Array(N_TARGETS);
      for (let i = 0; i < flat.length; i += 2) disc[flat[i]] = Math.max(flat[i + 1] - this.d, 0) / total;
      out = { disc, weight: (this.d * distinct) / total };
    }
    this.cache.set(ck, out);
    return out;
  }

  predict(context: Token[]): Float64Array {
    const ctx = [...new Array<number>(this.maxContext).fill(PAD), ...context];
    let p = this.pUni;
    for (let order = 1; order <= this.maxContext; order++) {
      const layer = this.dense(order, ctx.slice(-order).join(','));
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
  private chains = new Map<string, Chain>();

  constructor(private readonly json: NgramJson) {
    if (json.vocabSize !== VOCAB_SIZE || json.interval0 !== INTERVAL0 || !json.maxContext) {
      throw new Error('ngram.json does not match the app; rebuild it with model/build_ngram.py');
    }
  }

  private chain(genre: string): Chain {
    const key = genre in this.json.models ? genre : 'all';
    let c = this.chains.get(key);
    if (!c) {
      const m = this.json.models;
      c = new Chain(m[key], m.all, this.json.discount, this.json.maxContext);
      this.chains.set(key, c);
    }
    return c;
  }

  predictNext(context: Token[], genre: string): Float32Array {
    const p = this.chain(genre).predict(context);
    let sum = 0;
    for (let i = 0; i < p.length; i++) sum += p[i];
    const out = new Float32Array(VOCAB_SIZE);
    for (let i = 0; i < p.length; i++) out[INTERVAL0 + i] = p[i] / sum;
    return out;
  }
}
