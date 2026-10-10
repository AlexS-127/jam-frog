import gruText from '../../../model/export/gru_weights.json?raw';
import ngramText from '../../../model/export/ngram.json?raw';
import { cached } from '../core/cached';
import { GruModel, type GruWeights } from '../core/gru';
import type { ChordModel } from '../core/model';
import { NgramModel, type NgramJson } from '../core/ngram';

/** Both chord models, from model/export, behind the shared ChordModel interface. */
export function loadModels(): Record<'ngram' | 'gru', ChordModel> {
  return {
    ngram: cached(new NgramModel(JSON.parse(ngramText) as NgramJson)),
    gru: cached(new GruModel(JSON.parse(gruText) as GruWeights)),
  };
}
