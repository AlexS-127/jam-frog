import { Midi } from '@tonejs/midi';
import { describe, expect, it } from 'vitest';
import { buildMidi, keepFileName, toNotes } from './keep';
import type { NoteEvent } from './types';

const on = (pitch: number, time: number, velocity = 100): NoteEvent => ({ pitch, velocity, time });
const off = (pitch: number, time: number): NoteEvent => ({ pitch, velocity: 0, time });

describe('Keep', () => {
  // 120 BPM: a beat is 500 ms. The phrase starts at t = 10 s on the performance clock.
  const phrase = [on(60, 10000), on(64, 10010), on(67, 10020), off(60, 11000), off(64, 11000), off(67, 11000), on(57, 12000), on(60, 12000), on(64, 12000), off(57, 13000), off(60, 13000), off(64, 13000)];
  const answer = [on(65, 18000, 85), on(69, 18000, 85), on(72, 18000, 85), off(65, 20000), off(69, 20000), off(72, 20000)];

  it('writes a 2-track file that reads back with the right notes, times and tempo', () => {
    const midi = new Midi(buildMidi(phrase, answer, 120));
    expect(Math.round(midi.header.tempos[0].bpm)).toBe(120);
    expect(midi.tracks.map((t) => t.name)).toEqual(['You', 'Frog']);
    const you = midi.tracks[0].notes;
    expect(you.map((n) => n.midi)).toEqual([60, 64, 67, 57, 60, 64]);
    expect(you[0].time).toBeCloseTo(0, 2); // time 0 = the phrase's first note
    expect(you[0].duration).toBeCloseTo(1, 2);
    expect(you[3].time).toBeCloseTo(2, 2);
    const frog = midi.tracks[1].notes;
    expect(frog.map((n) => n.midi)).toEqual([65, 69, 72]);
    expect(frog[0].time).toBeCloseTo(8, 2);
    expect(frog[0].duration).toBeCloseTo(2, 2);
    expect(frog[0].velocity).toBeCloseTo(85 / 127, 1);
  });

  it('closes notes that never got a note-off', () => {
    const notes = toNotes([on(60, 0), on(62, 100), off(62, 400)], 2000);
    expect(notes).toEqual([
      { pitch: 60, start: 0, end: 2000, velocity: 100 },
      { pitch: 62, start: 100, end: 400, velocity: 100 },
    ]);
  });

  it('treats a re-strike as the end of the previous note', () => {
    expect(toNotes([on(60, 0), on(60, 500), off(60, 900)], 2000).map((n) => [n.start, n.end])).toEqual([[0, 500], [500, 900]]);
  });

  it('writes a valid empty file when there is nothing to keep', () => {
    expect(new Midi(buildMidi([], [], 100)).tracks).toHaveLength(0);
  });

  it('names files by date and time', () => {
    expect(keepFileName(new Date(2026, 9, 10, 22, 5))).toBe('jam-frog-2026-10-10-2205.mid');
  });
});
