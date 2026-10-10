import { QUALITY_INTERVALS } from './chords';
import type { ChordSymbol } from './types';

/** Close-position voicings of a chord (every inversion) with all notes inside [lo, hi]. */
export function candidateVoicings(chord: ChordSymbol, lo: number, hi: number): number[][] {
  // Rotate over distinct pitch classes only; a power chord (root, fifth, octave) gets its octave
  // doubling added back on top, so no voicing ever holds the same note twice.
  const iv = [...new Set(QUALITY_INTERVALS[chord.quality].map((x) => x % 12))];
  const doubleBass = chord.quality === 'pow';
  const out: number[][] = [];
  for (let inv = 0; inv < iv.length; inv++) {
    // rotate: the inverted chord's tones, each stacked above the previous
    const rotated = [...iv.slice(inv), ...iv.slice(0, inv).map((x) => x + 12)];
    for (let bass = lo; bass <= hi; bass++) {
      if ((((bass - chord.root - rotated[0]) % 12) + 12) % 12 !== 0) continue;
      const notes = rotated.map((x) => bass + x - rotated[0]);
      if (doubleBass) notes.push(bass + 12);
      if (notes[notes.length - 1] <= hi) out.push(notes);
    }
  }
  return out;
}

/** Total movement between two voicings; handles different note counts by nearest-note matching. */
export function movement(a: number[], b: number[]): number {
  if (a.length === b.length) return a.reduce((s, x, i) => s + Math.abs(x - b[i]), 0);
  const near = (x: number, ys: number[]) => Math.min(...ys.map((y) => Math.abs(x - y)));
  return (a.reduce((s, x) => s + near(x, b), 0) + b.reduce((s, y) => s + near(y, a), 0)) / 2;
}

/**
 * Voice `chord` inside [lo, hi] (default C3..C5 = MIDI 60..84) with the least total movement from `prev`.
 * Without a previous voicing, picks the one centred nearest the middle of the range.
 */
export function voiceChord(chord: ChordSymbol, prev: number[] | null, lo = 60, hi = 84): number[] {
  const cands = candidateVoicings(chord, lo, hi);
  if (cands.length === 0) throw new Error(`no voicing for ${chord.root}/${chord.quality} in ${lo}..${hi}`);
  const mid = (lo + hi) / 2;
  const cost = (v: number[]) =>
    prev && prev.length
      ? movement(v, [...prev].sort((a, b) => a - b))
      : Math.abs(v.reduce((s, x) => s + x, 0) / v.length - mid);
  return cands.reduce((best, v) => (cost(v) < cost(best) ? v : best));
}

/** Voicing near what the player just played, in the player's own register (for suggestion keyboards). */
export function voiceNearPlayer(chord: ChordSymbol, played: number[]): number[] {
  if (played.length === 0) return voiceChord(chord, null);
  const lo = Math.min(...played) - 5;
  const hi = Math.max(Math.max(...played) + 5, lo + 16);
  return voiceChord(chord, played, lo, hi);
}
