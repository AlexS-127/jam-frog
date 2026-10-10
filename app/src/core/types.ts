// Shared interfaces. Everything downstream of the bridge depends only on these.

/** A note event coming from Ableton. velocity 0 means note off. */
export interface NoteEvent {
  pitch: number;
  velocity: number;
  /** performance.now()-compatible timestamp in ms */
  time: number;
}

/** Where played notes come from (Frog Ear over OSC, or the "JamFrog In" port). */
export interface NoteSource {
  readonly name: string;
  onNote(cb: (e: NoteEvent) => void): void;
  close(): void;
}

/** Where the frog's notes go (Frog Voice over OSC, or the "JamFrog Out" port). */
export interface NoteSink {
  readonly name: string;
  /** velocity 0 means note off */
  send(pitch: number, velocity: number): void;
  close(): void;
}

/** The 9 chord quality classes shared with the model, in model/export/vocab.json order. */
export const QUALITIES = ['maj', 'min', 'dim', 'aug', 'sus', 'dom7', 'maj7', 'min7', 'pow'] as const;
export type Quality = (typeof QUALITIES)[number];

export interface Chord {
  /** root pitch class, 0 = C */
  root: number;
  quality: Quality;
  /** display name, e.g. "Am7", "F#dim", "Csus4", "E5" */
  name: string;
  /** the MIDI notes that formed it, ascending */
  pitches: number[];
}

/** A chord as the model sees it: root pitch class + quality class. */
export interface ChordSymbol {
  root: number;
  quality: Quality;
}

/** One of the 3 live suggestions shown in the overlay. */
export interface Suggestion {
  chord: ChordSymbol;
  /** display name, e.g. "Bb" */
  name: string;
  /** MIDI notes for the mini keyboard, voiced near the player's last chord */
  voicing: number[];
  /** probability after weirdness reshaping, 0..1 */
  prob: number;
  /** borrowed from the parallel key (e.g. bVI, bVII in major); drives the "weird" frog */
  borrowed: boolean;
}

/** A frog answer: 2-4 chords, one per 2 beats. */
export interface AnswerPlan {
  chords: { chord: ChordSymbol; name: string; voicing: number[] }[];
  beatsPerChord: number;
}

export type FrogMood = 'idle' | 'listening' | 'thinking' | 'weird';
