import type { NoteEvent, NoteSink, NoteSource } from '../../core/types';

// Fallback bridge: virtual MIDI ports (macOS IAC Driver buses "JamFrog In" / "JamFrog Out").

export async function getMidiAccess(): Promise<MIDIAccess> {
  return navigator.requestMIDIAccess({ sysex: false });
}

export class WebMidiNoteSource implements NoteSource {
  readonly name: string;
  private listeners: ((e: NoteEvent) => void)[] = [];

  constructor(private readonly input: MIDIInput) {
    this.name = input.name ?? 'MIDI input';
    input.onmidimessage = (msg) => {
      const d = msg.data;
      if (!d || d.length < 3) return;
      const type = d[0] & 0xf0;
      if (type !== 0x90 && type !== 0x80) return; // notes only; ignore clock, CCs, etc.
      const e: NoteEvent = { pitch: d[1], velocity: type === 0x90 ? d[2] : 0, time: msg.timeStamp };
      for (const cb of this.listeners) cb(e);
    };
  }

  onNote(cb: (e: NoteEvent) => void): void {
    this.listeners.push(cb);
  }

  close(): void {
    this.input.onmidimessage = null;
    this.listeners = [];
  }
}

export class WebMidiNoteSink implements NoteSink {
  readonly name: string;
  private held = new Set<number>();

  constructor(private readonly output: MIDIOutput, private readonly channel = 0) {
    this.name = output.name ?? 'MIDI output';
  }

  send(pitch: number, velocity: number): void {
    if (velocity > 0) {
      this.output.send([0x90 | this.channel, pitch, velocity]);
      this.held.add(pitch);
    } else {
      this.output.send([0x80 | this.channel, pitch, 64]);
      this.held.delete(pitch);
    }
  }

  close(): void {
    for (const p of this.held) this.output.send([0x80 | this.channel, p, 64]);
    this.held.clear();
  }
}
