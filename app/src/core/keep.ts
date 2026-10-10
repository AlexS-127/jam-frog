import { Midi } from '@tonejs/midi';
import type { NoteEvent } from './types';

interface Held {
  start: number;
  velocity: number;
}

/** Pair note-ons with note-offs. Notes still held at the end last until `end`. Times in ms. */
export function toNotes(events: NoteEvent[], end: number): { pitch: number; start: number; end: number; velocity: number }[] {
  const held = new Map<number, Held>();
  const out: { pitch: number; start: number; end: number; velocity: number }[] = [];
  const close = (pitch: number, t: number) => {
    const h = held.get(pitch);
    if (!h) return;
    held.delete(pitch);
    out.push({ pitch, start: h.start, end: Math.max(t, h.start + 1), velocity: h.velocity });
  };
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    if (e.velocity > 0) {
      close(e.pitch, e.time); // a re-strike ends the previous note
      held.set(e.pitch, { start: e.time, velocity: e.velocity });
    } else {
      close(e.pitch, e.time);
    }
  }
  for (const pitch of [...held.keys()]) close(pitch, end);
  return out.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}

/**
 * The player's phrase and the frog's answer as a 2-track MIDI file ("You", "Frog"), at `bpm`,
 * with time 0 at the phrase's first note.
 */
export function buildMidi(phrase: NoteEvent[], answer: NoteEvent[], bpm: number): Uint8Array {
  const all = [...phrase, ...answer];
  const midi = new Midi();
  midi.header.setTempo(bpm);
  midi.header.name = 'Jam Frog';
  if (all.length === 0) return midi.toArray();
  const t0 = Math.min(...all.map((e) => e.time));
  const tEnd = Math.max(...all.map((e) => e.time)) + 60000 / bpm; // hold anything unreleased for a beat
  for (const [name, events, channel] of [['You', phrase, 0], ['Frog', answer, 1]] as const) {
    const track = midi.addTrack();
    track.name = name;
    track.channel = channel;
    for (const n of toNotes(events, tEnd)) {
      track.addNote({
        midi: n.pitch,
        time: (n.start - t0) / 1000,
        duration: (n.end - n.start) / 1000,
        velocity: n.velocity / 127,
      });
    }
  }
  return midi.toArray();
}

/** A file name like "jam-frog-2026-10-10-2215.mid" (local time). */
export function keepFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `jam-frog-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.mid`;
}
