import type { NoteEvent } from './types';

/**
 * Remembers notes the app just sent so that, if they come back in through the
 * source (e.g. a track set to "All Ins"), they are dropped instead of looping.
 */
export class EchoFilter {
  private recent: { pitch: number; on: boolean; time: number }[] = [];
  ignored = 0;

  constructor(private readonly windowMs = 80) {}

  sent(pitch: number, velocity: number, time: number): void {
    this.prune(time);
    this.recent.push({ pitch, on: velocity > 0, time });
  }

  /** true if this incoming event is an echo of something we sent; consumes the match */
  isEcho(e: NoteEvent): boolean {
    this.prune(e.time);
    const on = e.velocity > 0;
    const i = this.recent.findIndex((r) => r.pitch === e.pitch && r.on === on);
    if (i < 0) return false;
    this.recent.splice(i, 1);
    this.ignored++;
    return true;
  }

  private prune(now: number): void {
    this.recent = this.recent.filter((r) => now - r.time <= this.windowMs);
  }
}
