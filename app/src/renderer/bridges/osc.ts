import type { NoteEvent, NoteSink, NoteSource } from '../../core/types';
import { STYLE_NAMES } from '../../core/styles';

// Primary bridge: the Frog Ear / Frog Voice Max for Live devices, OSC over localhost UDP.
// The main process owns the sockets; this side only sees decoded messages over IPC.

type Listener = (msg: unknown[]) => void;
const listeners = new Set<Listener>();
let hooked = false;

/** Subscribe to every OSC message from Live; returns an unsubscribe function. */
export function onOsc(cb: Listener): () => void {
  if (!hooked) {
    hooked = true;
    window.jamFrog.osc.onMessage((msg) => listeners.forEach((l) => l(msg)));
  }
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export class OscNoteSource implements NoteSource {
  readonly name = 'Frog Ear (Max for Live)';
  private noteListeners: ((e: NoteEvent) => void)[] = [];
  private off = onOsc((msg) => {
    if (msg[0] !== '/note') return;
    const e: NoteEvent = { pitch: Number(msg[1]), velocity: Number(msg[2]), time: performance.now() };
    for (const cb of this.noteListeners) cb(e);
  });

  onNote(cb: (e: NoteEvent) => void): void {
    this.noteListeners.push(cb);
  }

  close(): void {
    this.off();
    this.noteListeners = [];
  }
}

export class OscNoteSink implements NoteSink {
  readonly name = 'Frog Voice (Max for Live)';
  private held = new Set<number>();

  send(pitch: number, velocity: number): void {
    window.jamFrog.osc.send('/note', pitch, velocity);
    if (velocity > 0) this.held.add(pitch);
    else this.held.delete(pitch);
  }

  /** Note off for every note still held. */
  release(): void {
    for (const p of this.held) window.jamFrog.osc.send('/note', p, 0);
    this.held.clear();
  }

  close(): void {
    this.release();
  }
}

/**
 * Switch the frog's sound: Frog Voice moves the Chain Selector of the Instrument Rack on its track to the chain
 * named after the genre (see ableton/frog_genre.js). Sent as an index into STYLE_NAMES; -1 is all styles.
 */
export function sendGenre(genre: string): void {
  window.jamFrog.osc.send('/genre', (STYLE_NAMES as string[]).indexOf(genre));
}
