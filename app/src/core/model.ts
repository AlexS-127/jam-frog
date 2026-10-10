import type { Token } from './vocab';

/**
 * Every chord model (n-gram, GRU) implements this.
 * Returns probabilities over the whole vocabulary (length VOCAB_SIZE); specials are 0.
 * `genre` is one of GENRES or "all".
 */
export interface ChordModel {
  readonly name: string;
  predictNext(context: Token[], genre: string): Float32Array;
}
