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
 * notes; returns null for fewer than 3 distinct pitch classes or no good match.
 */
export function detectChord(pitches: number[]): Chord | null {
  const sorted = [...pitches].sort((a, b) => a - b);
  const pcs = new Set(sorted.map((p) => ((p % 12) + 12) % 12));
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
};

const QUALITY_SUFFIX: Record<Quality, string> = {
  maj: '', min: 'm', dim: 'dim', aug: 'aug', sus: 'sus4', dom7: '7', maj7: 'maj7', min7: 'm7',
};

export function chordName(root: number, quality: Quality): string {
  return PITCH_NAMES[((root % 12) + 12) % 12] + QUALITY_SUFFIX[quality];
}
