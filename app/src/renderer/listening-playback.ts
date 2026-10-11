import type { NoteSink } from '../core/types';
import type { PlaybackChord } from './listening-session';

interface PlaybackCallbacks {
  onChord(chord: PlaybackChord): void;
  onComplete(): void;
  onError(error: unknown): void;
}

/** One scheduled boundary at a time; every exit attempts to release every held note. */
export class ListeningPlayer {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sink: NoteSink | null = null;
  private held = new Set<number>();

  stop(): unknown {
    clearTimeout(this.timer);
    this.timer = undefined;
    const error = this.release();
    this.sink = null;
    return error;
  }

  private release(): unknown {
    let error: unknown;
    for (const pitch of this.held) {
      try { this.sink?.send(pitch, 0); } catch (cause) { error ??= cause; }
    }
    this.held.clear();
    return error;
  }

  play(sink: NoteSink, sequence: PlaybackChord[], bpm: number, callbacks: PlaybackCallbacks): void {
    const stopError = this.stop();
    if (stopError) { callbacks.onError(stopError); return; }
    this.sink = sink;
    let index = 0;
    let deadline = performance.now() + 160;
    const boundary = () => {
      this.timer = undefined;
      try {
        const releaseError = this.release();
        if (releaseError) throw releaseError;
        if (performance.now() - deadline > 250) throw new Error('Playback timing was interrupted. Replay this clip.');
        const chord = sequence[index++];
        if (!chord) {
          this.sink = null;
          callbacks.onComplete();
          return;
        }
        for (const pitch of chord.notes) {
          this.held.add(pitch);
          sink.send(pitch, 85);
        }
        callbacks.onChord(chord);
        deadline += chord.beats * 60000 / bpm;
        this.timer = setTimeout(boundary, Math.max(0, deadline - performance.now()));
      } catch (error) {
        this.stop();
        callbacks.onError(error);
      }
    };
    this.timer = setTimeout(boundary, 160);
  }
}
