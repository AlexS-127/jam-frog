import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ChordModel } from './model';
import { genresOf, STYLE_NAMES, styled } from './styles';
import { GENRES } from './vocab';

/** A fake model whose prediction is the genre's index in GENRES at every token (-1 for "all"). */
const fake: ChordModel = {
  name: 'fake',
  predictNext: (_context, genre) => new Float32Array(3).fill((GENRES as readonly string[]).indexOf(genre)),
};

describe('styles', () => {
  it('stands for model genres', () => {
    expect(genresOf('pop')).toEqual(['pop', 'pop rock']);
    expect(genresOf('punk')).toEqual(['punk', 'metal', 'alternative']);
    expect(genresOf('all')).toEqual(['all']);
    expect(genresOf('constructor')).toEqual(['constructor']);
  });

  it('averages the predictions of a style\'s genres, and passes single genres and "all" through', () => {
    const m = styled(fake);
    expect(m.name).toBe('fake');
    const avg = (gs: string[]) => gs.reduce((s, g) => s + (GENRES as readonly string[]).indexOf(g), 0) / gs.length;
    expect(m.predictNext([], 'punk')[0]).toBeCloseTo(avg(['punk', 'metal', 'alternative']));
    expect(m.predictNext([], 'pop')[0]).toBeCloseTo(avg(['pop', 'pop rock']));
    expect(m.predictNext([], 'jazz')[0]).toBe(GENRES.indexOf('jazz'));
    expect(m.predictNext([], 'all')[0]).toBe(-1);
  });

  it('matches the genre list in Frog Voice (ableton/frog_genre.js picks the rack chain by index)', () => {
    const js = readFileSync(new URL('../../../ableton/frog_genre.js', import.meta.url), 'utf8');
    const list = /var GENRES = \[([^\]]*)\]/.exec(js)![1];
    expect([...list.matchAll(/'([^']*)'/g)].map((m) => m[1])).toEqual(STYLE_NAMES);
  });
});
