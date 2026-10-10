import type { Chord, Quality } from './types';

export const PITCH_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

interface Template {
  intervals: number[];
  quality: Quality;
  suffix: string;
  /** small tie-break preference, higher wins */
  pref: number;
}

// Several shapes fold into one of the 8 model classes (e.g. dim7 and m7b5 -> dim).
const TEMPLATES: Template[] = [
  { intervals: [0, 4, 7], quality: 'maj', suffix: '', pref: 9 },
  { intervals: [0, 3, 7], quality: 'min', suffix: 'm', pref: 8 },
  { intervals: [0, 4, 7, 10], quality: 'dom7', suffix: '7', pref: 7 },
  { intervals: [0, 3, 7, 10], quality: 'min7', suffix: 'm7', pref: 6 },
  { intervals: [0, 4, 7, 11], quality: 'maj7', suffix: 'maj7', pref: 5 },
  { intervals: [0, 3, 6], quality: 'dim', suffix: 'dim', pref: 4 },
  { intervals: [0, 3, 6, 10], quality: 'dim', suffix: 'm7b5', pref: 3.5 },
  { intervals: [0, 3, 6, 9], quality: 'dim', suffix: 'dim7', pref: 3 },
  { intervals: [0, 5, 7], quality: 'sus', suffix: 'sus4', pref: 2 },
  { intervals: [0, 2, 7], quality: 'sus', suffix: 'sus2', pref: 1.5 },
  { intervals: [0, 4, 8], quality: 'aug', suffix: 'aug', pref: 1 },
];

/**
 * Name the chord formed by a set of MIDI notes. Handles inversions and doubled
 * notes. Needs 3 distinct pitch classes, except a root plus its perfect fifth,
 * which is a power chord. Returns null for anything else.
 */
export function detectChord(pitches: number[]): Chord | null {
  const sorted = [...pitches].sort((a, b) => a - b);
  const pcs = new Set(sorted.map((p) => ((p % 12) + 12) % 12));
  if (pcs.size === 2) return powerChord(pcs, sorted);
  if (pcs.size < 3) return null;
  const bass = sorted[0] % 12;

  let best: { score: number; root: number; t: Template } | null = null;
  for (let root = 0; root < 12; root++) {
    for (const t of TEMPLATES) {
      const tones = new Set(t.intervals.map((i) => (root + i) % 12));
      let matched = 0;
      for (const pc of tones) if (pcs.has(pc)) matched++;
      const missing = tones.size - matched;
      const extra = pcs.size - matched;
      // Root must be played; allow at most one missing tone (e.g. a 7th chord without its 5th).
      if (!pcs.has(root) || missing > 1 || matched < 3) continue;
      const score = 2 * matched - 2 * missing - extra + (root === bass ? 0.5 : 0) + t.pref * 0.01;
      if (!best || score > best.score) best = { score, root, t };
    }
  }
  if (!best) return null;
  return {
    root: best.root,
    quality: best.t.quality,
    name: PITCH_NAMES[best.root] + best.t.suffix,
    pitches: sorted,
  };
}

/** Two pitch classes a perfect fifth apart (in either order, e.g. G under C) form a power chord. */
function powerChord(pcs: Set<number>, sorted: number[]): Chord | null {
  const [a, b] = [...pcs];
  const root = (a + 7) % 12 === b ? a : (b + 7) % 12 === a ? b : null;
  if (root === null) return null;
  return { root, quality: 'pow', name: PITCH_NAMES[root] + '5', pitches: sorted };
}

/** Basic triad/7th intervals for a model chord class, used to voice chords we generate. */
export const QUALITY_INTERVALS: Record<Quality, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  dim: [0, 3, 6],
  aug: [0, 4, 8],
  sus: [0, 5, 7],
  dom7: [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  pow: [0, 7, 12],
};

const QUALITY_SUFFIX: Record<Quality, string> = {
  maj: '', min: 'm', dim: 'dim', aug: 'aug', sus: 'sus4', dom7: '7', maj7: 'maj7', min7: 'm7', pow: '5',
};

export function chordName(root: number, quality: Quality): string {
  return PITCH_NAMES[((root % 12) + 12) % 12] + QUALITY_SUFFIX[quality];
}

const NAME_SUFFIX: Record<string, Quality> = {
  '': 'maj', m: 'min', min: 'min', dim: 'dim', aug: 'aug', sus4: 'sus', sus2: 'sus', sus: 'sus',
  '7': 'dom7', maj7: 'maj7', m7: 'min7', min7: 'min7', '5': 'pow',
};

/** "Am" -> {root 9, min}; "Bb7" -> {root 10, dom7}; "F#m7" -> {root 6, min7}. Throws on anything else. */
export function parseChordName(name: string): { root: number; quality: Quality } {
  const m = /^([A-G])([#b]?)(.*)$/.exec(name.trim());
  const quality = m ? NAME_SUFFIX[m[3]] : undefined;
  if (!m || !quality) throw new Error(`can't read chord name "${name}"`);
  const letter = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  const root = (letter + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  return { root, quality };
}
