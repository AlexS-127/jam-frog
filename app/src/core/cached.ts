import type { ChordModel } from './model';
import type { Token } from './vocab';

/**
 * Memoise a model's predictions. Answer planning asks for the same contexts many times (all candidates
 * share their first step, and most share the second), which matters for the GRU (~2-5 ms a call).
 * Both models look at most 8 tokens back, so the last 8 tokens and the genre are the key.
 */
export function cached(model: ChordModel, maxEntries = 4000): ChordModel {
  const cache = new Map<string, Float32Array>();
  return {
    name: model.name,
    predictNext(context: Token[], genre: string): Float32Array {
      const key = `${genre}|${context.slice(-8).join(',')}|${context.length < 8 ? context.length : 8}`;
      let p = cache.get(key);
      if (!p) {
        p = model.predictNext(context, genre);
        if (cache.size >= maxEntries) cache.clear();
        cache.set(key, p);
      }
      return p;
    },
  };
}
