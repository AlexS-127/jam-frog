// Test-only helper: the exported n-gram, read from disk (Node). Not imported by app code.
import { readFileSync } from 'node:fs';
import type { NgramJson } from './ngram';

export const ngramJson: NgramJson = JSON.parse(
  readFileSync(new URL('../../../model/export/ngram.json', import.meta.url), 'utf8'),
);
