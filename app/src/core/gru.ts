import type { ChordModel } from './model';
import { GENRES, INTERVAL0, PAD, VOCAB_SIZE, type Token } from './vocab';

export interface GruWeights {
  vocabSize: number;
  interval0: number;
  ctx: number;
  emb: number;
  hidden: number;
  genreIds: number;
  tok: number[];
  genre: number[];
  wIh: number[];
  wHh: number[];
  bIh: number[];
  bHh: number[];
  headW: number[];
  headB: number[];
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

export class GruModel implements ChordModel {
  readonly name = 'gru';
  private readonly tok: Float32Array;
  private readonly genre: Float32Array;
  private readonly wIh: Float32Array;
  private readonly wHh: Float32Array;
  private readonly bIh: Float32Array;
  private readonly bHh: Float32Array;
  private readonly headW: Float32Array;
  private readonly headB: Float32Array;
  private readonly E: number;
  private readonly H: number;
  private readonly T: number;
  private readonly ctx: number;
  private readonly x: Float32Array;
  private readonly h: Float32Array;
  private readonly gi: Float32Array;
  private readonly gh: Float32Array;

  constructor(w: GruWeights) {
    if (w.vocabSize !== VOCAB_SIZE || w.interval0 !== INTERVAL0) {
      throw new Error(`gru_weights.json vocab (${w.vocabSize}/${w.interval0}) does not match the app's`);
    }
    this.E = w.emb;
    this.H = w.hidden;
    this.T = w.vocabSize - w.interval0;
    this.ctx = w.ctx;
    this.tok = Float32Array.from(w.tok);
    this.genre = Float32Array.from(w.genre);
    this.wIh = Float32Array.from(w.wIh);
    this.wHh = Float32Array.from(w.wHh);
    this.bIh = Float32Array.from(w.bIh);
    this.bHh = Float32Array.from(w.bHh);
    this.headW = Float32Array.from(w.headW);
    this.headB = Float32Array.from(w.headB);
    this.x = new Float32Array(this.E);
    this.h = new Float32Array(this.H);
    this.gi = new Float32Array(3 * this.H);
    this.gh = new Float32Array(3 * this.H);
  }

  predictNext(context: Token[], genre: string): Float32Array {
    const { E, H, T, x, h, gi, gh } = this;
    const gid = genreId(genre);
    const recent = context.slice(-this.ctx);
    const tokens = [...new Array<Token>(this.ctx - recent.length).fill(PAD), ...recent];

    h.fill(0);
    for (const t of tokens) {
      for (let e = 0; e < E; e++) x[e] = this.tok[t * E + e] + this.genre[gid * E + e];
      matVec(this.wIh, x, this.bIh, gi, 3 * H, E);
      matVec(this.wHh, h, this.bHh, gh, 3 * H, H);
      for (let j = 0; j < H; j++) {
        const r = sigmoid(gi[j] + gh[j]);
        const z = sigmoid(gi[H + j] + gh[H + j]);
        const n = Math.tanh(gi[2 * H + j] + r * gh[2 * H + j]);
        h[j] = (1 - z) * n + z * h[j];
      }
    }

    const logits = new Float32Array(T);
    matVec(this.headW, h, this.headB, logits, T, H);
    let max = -Infinity;
    for (let i = 0; i < T; i++) max = Math.max(max, logits[i]);
    let sum = 0;
    for (let i = 0; i < T; i++) sum += logits[i] = Math.exp(logits[i] - max);

    const probs = new Float32Array(VOCAB_SIZE); // specials stay 0
    for (let i = 0; i < T; i++) probs[INTERVAL0 + i] = logits[i] / sum;
    return probs;
  }
}

/** Genre name -> embedding id; anything not in GENRES (incl "all") is id 12. */
export function genreId(genre: string): number {
  const i = (GENRES as readonly string[]).indexOf(genre);
  return i < 0 ? GENRES.length : i;
}

/** out = W · v + b, with W stored row-major as [rows, cols]. */
function matVec(W: Float32Array, v: Float32Array, b: Float32Array, out: Float32Array, rows: number, cols: number): void {
  for (let r = 0; r < rows; r++) {
    let acc = b[r];
    const off = r * cols;
    for (let c = 0; c < cols; c++) acc += W[off + c] * v[c];
    out[r] = acc;
  }
}