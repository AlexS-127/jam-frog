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

/** The 8 chord quality classes shared with the model (see model/prepare.py). */
export const QUALITIES = ['maj', 'min', 'dim', 'aug', 'sus', 'dom7', 'maj7', 'min7'] as const;
export type Quality = (typeof QUALITIES)[number];

export interface Chord {
  /** root pitch class, 0 = C */
  root: number;
  quality: Quality;
  /** display name, e.g. "Am7", "F#dim", "Csus4" */
  name: string;
  /** the MIDI notes that formed it, ascending */
  pitches: number[];
}
