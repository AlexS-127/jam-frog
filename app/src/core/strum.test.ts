import { describe, expect, it } from 'vitest';
import { detectNotes, STRUM_DOWN, STRUM_UP, strumNotes, strumsFor } from './strum';
import { QUALITIES } from './types';

describe('Ample Guitar strums (Strummer, Detect mode)', () => {
  it('voices every chord from C1: root in C1-B1, the rest within C1-B2', () => {
    expect(detectNotes({ root: 9, quality: 'min' })).toEqual([45, 48, 52]); // Am: A1 C2 E2
    expect(detectNotes({ root: 7, quality: 'dom7' })).toEqual([43, 47, 50, 53]); // G7
    expect(detectNotes({ root: 0, quality: 'pow' })).toEqual([36, 43]); // C5: C1 G1, as in Ample's chart
    for (let root = 0; root < 12; root++) {
      for (const quality of QUALITIES) {
        const notes = detectNotes({ root, quality });
        expect(notes[0]).toBeGreaterThanOrEqual(36);
        expect(notes[0]).toBeLessThanOrEqual(47);
        expect(Math.max(...notes)).toBeLessThanOrEqual(59);
      }
    }
  });
  it('plays the chord keys first, then strums down (C3) or up (E3)', () => {
    const down = strumNotes({ root: 0, quality: 'maj' }, false);
    expect(down.map((n) => n.pitch)).toEqual([36, 40, 43, STRUM_DOWN]);
    expect(strumNotes({ root: 0, quality: 'maj' }, true).at(-1)!.pitch).toBe(STRUM_UP);
    expect([STRUM_DOWN, STRUM_UP]).toEqual([60, 64]);
  });
  it('strums every genre but electronic and pop', () => {
    expect(['jazz', 'rock', 'country', 'punk', 'all'].every((g) => strumsFor(g))).toBe(true);
    expect(['electronic', 'pop'].some((g) => strumsFor(g))).toBe(false);
    // All styles (the user chain) strums only if the user says it is an Ample Guitar
    expect(strumsFor('all', false)).toBe(false);
    expect(strumsFor('rock', false)).toBe(true);
  });
});
