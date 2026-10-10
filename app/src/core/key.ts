import type { ChordSymbol, Quality } from './types';

export interface Key {
  tonic: number;
  minor: boolean;
}

type Family = 'major' | 'minor' | 'dim';
const FAMILY: Record<Quality, Family> = {
  maj: 'major', maj7: 'major', dom7: 'major', sus: 'major', pow: 'major', aug: 'major',
  min: 'minor', min7: 'minor',
  dim: 'dim',
};

// Diatonic chords as (interval above tonic, family). Minor includes the major V of harmonic minor.
const DIATONIC: Record<'major' | 'minor', [number, Family][]> = {
  major: [[0, 'major'], [2, 'minor'], [4, 'minor'], [5, 'major'], [7, 'major'], [9, 'minor'], [11, 'dim']],
  minor: [[0, 'minor'], [2, 'dim'], [3, 'major'], [5, 'minor'], [7, 'minor'], [7, 'major'], [8, 'major'], [10, 'major']],
};

// Chords borrowed from the parallel key (modal mixture).
//   in major, from minor: bIII, iv, v, bVI, bVII, ii°      in minor, from major: I, ii, IV
const BORROWED: Record<'major' | 'minor', [number, Family][]> = {
  major: [[3, 'major'], [5, 'minor'], [7, 'minor'], [8, 'major'], [10, 'major'], [2, 'dim']],
  minor: [[0, 'major'], [2, 'minor'], [5, 'major']],
};

const mod12 = (n: number) => ((n % 12) + 12) % 12;
const has = (set: [number, Family][], c: ChordSymbol, key: Key) =>
  set.some(([iv, fam]) => mod12(key.tonic + iv) === c.root && FAMILY[c.quality] === fam);

export function isDiatonic(c: ChordSymbol, key: Key): boolean {
  return has(DIATONIC[key.minor ? 'minor' : 'major'], c, key);
}

export function isBorrowed(c: ChordSymbol, key: Key): boolean {
  return !isDiatonic(c, key) && has(BORROWED[key.minor ? 'minor' : 'major'], c, key);
}

/**
 * Best-guess key of a phrase: each of the 24 keys scores the recency-weighted share of chords that are
 * diatonic to it, plus a bonus when the tonic chord appears, most of all as the first or last chord.
 */
export function estimateKey(history: ChordSymbol[], window = 8): Key {
  const recent = history.slice(-window);
  if (recent.length === 0) return { tonic: 0, minor: false };
  let best: Key = { tonic: recent[0].root, minor: FAMILY[recent[0].quality] === 'minor' };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const key = { tonic, minor };
      const tonicChord = (c: ChordSymbol) => c.root === tonic && FAMILY[c.quality] === (minor ? 'minor' : 'major');
      let score = 0;
      recent.forEach((c, i) => {
        const w = 0.6 + (0.4 * (i + 1)) / recent.length; // newer chords count a bit more
        if (isDiatonic(c, key)) score += w;
        if (tonicChord(c)) score += 0.5 * w;
      });
      if (tonicChord(recent[0])) score += 1.0;
      if (tonicChord(recent[recent.length - 1])) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
  }
  return best;
}
