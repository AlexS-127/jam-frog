import type { ChordModel } from './model';
import type { GENRES, Token } from './vocab';

/**
 * The genre picker's choices. The models know the 12 Chordonomicon genres (GENRES); each choice stands for one or
 * more of them, and the frog asks the model for each and averages. "all" (every song) stays as it is.
 */
export const STYLES = {
  jazz: ['jazz'],
  rock: ['rock'],
  electronic: ['electronic'],
  country: ['country'],
  pop: ['pop', 'pop rock'],
  punk: ['punk', 'metal', 'alternative'],
} as const satisfies Record<string, readonly (typeof GENRES)[number][]>;

export type Style = keyof typeof STYLES;
export const STYLE_NAMES = Object.keys(STYLES) as Style[];

/** The model genres a picker choice stands for; anything else (incl "all") passes through. */
export function genresOf(style: string): readonly string[] {
  return Object.hasOwn(STYLES, style) ? STYLES[style as Style] : [style];
}

/** A model that takes a picker choice as its genre: the average of its genres' predictions. */
export function styled(model: ChordModel): ChordModel {
  return {
    get name() {
      return model.name;
    },
    predictNext(context: Token[], style: string): Float32Array {
      const genres = genresOf(style);
      if (genres.length === 1) return model.predictNext(context, genres[0]);
      const out = new Float32Array(model.predictNext(context, genres[0]));
      for (const g of genres.slice(1)) {
        const p = model.predictNext(context, g);
        for (let i = 0; i < out.length; i++) out[i] += p[i];
      }
      for (let i = 0; i < out.length; i++) out[i] /= genres.length;
      return out;
    },
  };
}
