import { describe, expect, it } from 'vitest';
import { detectChord } from './chords';

// MIDI 60 = C3 in Ableton's naming.
const cases: [string, number[], string, string][] = [
  ['C major, root position', [60, 64, 67], 'C', 'maj'],
  ['A minor, first inversion', [60, 64, 69], 'Am', 'min'],
  ['F major, second inversion', [60, 65, 69], 'F', 'maj'],
  ['G7, spread with doubled root', [43, 55, 59, 62, 65], 'G7', 'dom7'],
  ['Dm7', [62, 65, 69, 72], 'Dm7', 'min7'],
  ['Ebmaj7, third inversion', [62, 63, 67, 70], 'Ebmaj7', 'maj7'],
  ['B diminished', [59, 62, 65], 'Bdim', 'dim'],
  ['C augmented', [60, 64, 68], 'Caug', 'aug'],
  ['Dsus4', [62, 67, 69], 'Dsus4', 'sus'],
  ['F#m with doubled notes across octaves', [54, 61, 66, 69, 73, 78], 'F#m', 'min'],
  ['C7 without the 5th', [48, 64, 70], 'C7', 'dom7'],
  ['Cadd9 still reads as C', [60, 62, 64, 67], 'C', 'maj'],
  ['C5 power chord with octave', [48, 55, 60], 'C5', 'pow'],
  ['E5 power chord, bare fifth', [40, 47], 'E5', 'pow'],
  ['inverted power chord (fourth) still names the root', [55, 60], 'C5', 'pow'],
];

describe('detectChord', () => {
  it.each(cases)('%s', (_label, pitches, name, quality) => {
    const c = detectChord(pitches);
    expect(c?.name).toBe(name);
    expect(c?.quality).toBe(quality);
  });

  it('ignores single notes, octaves and two-note shapes that are not fifths', () => {
    expect(detectChord([60])).toBeNull();
    expect(detectChord([60, 72])).toBeNull();
    expect(detectChord([60, 64])).toBeNull(); // major third
    expect(detectChord([60, 69])).toBeNull(); // major sixth
    expect(detectChord([60, 66])).toBeNull(); // tritone
  });

  it('rejects clusters that are not chords', () => {
    expect(detectChord([60, 61, 62])).toBeNull();
  });
});
