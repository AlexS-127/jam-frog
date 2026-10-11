import { QUALITY_INTERVALS } from './chords';
import type { ChordSymbol } from './types';

// The frog's chords as MIDI for Ample Guitar's Strummer in Detect mode (amplesound.net/en/Guitar_Strummer.pdf):
// it reads the chord held within C1-B2, root in C1-B1, and strums it when a strum key is played: C4 strums
// down, E4 up. The strum key's velocity picks the strings (high: all six), so strums are always played hard.
// Note names as in Live and Ample: MIDI 60 is C3, so C1 = 36 and C4 = 72.

export const DETECT_ROOT_C1 = 36;
export const STRUM_DOWN = 72; // C4: down, full strings (open)
export const STRUM_UP = 76; // E4: up, full strings (open)
/** detected chord keys: firm, but they only choose the chord */
export const DETECT_VELOCITY = 100;
/** strum keys: Ample's top velocity layer strums all six strings */
export const STRUM_VELOCITY = 120;

/** The genres whose instrument isn't a strummed guitar: the frog plays its normal voicings for these. */
const NOT_STRUMMED = new Set(['electronic', 'pop']);

/**
 * Whether the frog's answers are sent as Ample strums for this genre (a picker choice, or "all"). All styles plays
 * the rack's `user` chain, whose instrument is the player's choice: `userAmple` says whether it is an Ample Guitar.
 */
export function strumsFor(genre: string, userAmple = true): boolean {
  if (genre === 'all') return userAmple;
  return !NOT_STRUMMED.has(genre);
}

/**
 * The chord in root position from C1, as Detect mode wants it (root in C1-B1, the rest within C1-B2), one note
 * per pitch class: a power chord is C1 G1, as in Ample's chord chart.
 */
export function detectNotes(chord: ChordSymbol): number[] {
  const intervals = [...new Set(QUALITY_INTERVALS[chord.quality].map((i) => i % 12))];
  return intervals.map((i) => DETECT_ROOT_C1 + chord.root + i);
}

/** One strum: the chord keys, then the strum key (down, or up for an up-strum). */
export function strumNotes(chord: ChordSymbol, up: boolean): { pitch: number; velocity: number }[] {
  return [
    ...detectNotes(chord).map((pitch) => ({ pitch, velocity: DETECT_VELOCITY })),
    { pitch: up ? STRUM_UP : STRUM_DOWN, velocity: STRUM_VELOCITY },
  ];
}
