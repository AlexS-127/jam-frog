import type { NoteEvent } from './types';

export interface NoteGroup {
  pitches: number[];
  /** time of the first onset in the group */
  firstTime: number;
}

/**
 * Groups note-ons whose onsets fall within `windowMs` of the first one.
 * Emits each group once the window has closed. Note-offs are ignored.
 */
export class OnsetGrouper {
  private pending: NoteEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly onGroup: (g: NoteGroup) => void,
    private readonly windowMs = 60,
  ) {}

  push(e: NoteEvent): void {
    if (e.velocity === 0) return;
    this.pending.push(e);
    if (this.timer === null) this.timer = setTimeout(() => this.flush(), this.windowMs);
  }

  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    if (this.pending.length === 0) return;
    const group = { pitches: this.pending.map((e) => e.pitch), firstTime: this.pending[0].time };
    this.pending = [];
    this.onGroup(group);
  }
}
