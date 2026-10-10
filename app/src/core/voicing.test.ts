import { describe, expect, it } from 'vitest';
import { candidateVoicings, movement, voiceChord, voiceNearPlayer } from './voicing';

const C = { root: 0, quality: 'maj' as const };
const F = { root: 5, quality: 'maj' as const };
const G7 = { root: 7, quality: 'dom7' as const };

describe('voicing', () => {
  it('lists every inversion inside the range', () => {
    const v = candidateVoicings(C, 60, 72);
    expect(v).toContainEqual([60, 64, 67]);
    expect(v).toContainEqual([64, 67, 72]);
    expect(v.every((n) => n.every((p) => p >= 60 && p <= 72))).toBe(true);
  });

  it('moves C -> F by the smallest total distance (C E G -> C F A)', () => {
    expect(voiceChord(F, [60, 64, 67])).toEqual([60, 65, 69]);
  });

  it('keeps answers inside C3..C5 (MIDI 60..84)', () => {
    const v = voiceChord(G7, [40, 47, 52]);
    expect(Math.min(...v)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...v)).toBeLessThanOrEqual(84);
  });

  it('voices suggestions in the player register', () => {
    const v = voiceNearPlayer(F, [43, 47, 50]); // low G
    expect(Math.max(...v)).toBeLessThan(60);
  });

  it('voices power chords without repeating a note (C#5: C# G# C#, or G# C# G#)', () => {
    const cs5 = { root: 1, quality: 'pow' as const };
    const all = candidateVoicings(cs5, 40, 84);
    expect(all.length).toBeGreaterThan(0);
    for (const v of all) expect(new Set(v).size).toBe(v.length);
    expect(all).toContainEqual([61, 68, 73]);
    expect(all).toContainEqual([56, 61, 68]);
    const near = voiceNearPlayer(cs5, [50, 57, 62]); // after D5
    expect(new Set(near).size).toBe(near.length);
  });

  it('measures movement across different note counts', () => {
    expect(movement([60, 64, 67], [60, 64, 67])).toBe(0);
    expect(movement([60, 64, 67, 70], [60, 64, 67])).toBe(1.5);
  });
});
