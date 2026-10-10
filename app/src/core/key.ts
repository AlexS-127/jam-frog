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

export interface KeyOptions {
  /** chords back at which a chord's evidence counts half (default 8, about two 4-chord phrases) */
  halfLife?: number;
  /** indices into `history` where the player started a phrase; those chords are strong tonic cues */
  phraseStarts?: number[];
}

/** Older evidence than this many half-lives is ignored. */
const MAX_HALF_LIVES = 8;

/**
 * Best-guess key of the jam session so far. Every chord votes for the keys it is diatonic to, with a bonus
 * for the key's tonic chord; votes fade by half every `halfLife` chords, so recent phrases dominate but a
 * long session still steadies the guess. Phrase-opening chords and the latest chord add tonic evidence.
 * Without `phraseStarts`, the first chord given counts as a phrase start.
 */
export function estimateKey(history: ChordSymbol[], opts: KeyOptions = {}): Key {
  const halfLife = opts.halfLife ?? 8;
  const from = Math.max(0, history.length - halfLife * MAX_HALF_LIVES);
  const recent = history.slice(from);
  if (recent.length === 0) return { tonic: 0, minor: false };
  const n = recent.length;
  const weight = (i: number) => Math.pow(0.5, (n - 1 - i) / halfLife);
  const starts = (opts.phraseStarts ?? [0]).map((i) => i - from).filter((i) => i >= 0 && i < n);

  let best: Key = { tonic: recent[n - 1].root, minor: FAMILY[recent[n - 1].quality] === 'minor' };
  let bestScore = -Infinity;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const minor of [false, true]) {
      const key = { tonic, minor };
      const tonicChord = (c: ChordSymbol) => c.root === tonic && FAMILY[c.quality] === (minor ? 'minor' : 'major');
      let score = 0;
      recent.forEach((c, i) => {
        const w = weight(i);
        if (isDiatonic(c, key)) score += w;
        if (tonicChord(c)) score += 0.5 * w;
      });
      for (const i of starts) if (tonicChord(recent[i])) score += 1.5 * weight(i);
      if (tonicChord(recent[n - 1])) score += 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    }
  }
  return best;
}
