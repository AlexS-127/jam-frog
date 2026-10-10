import { describe, expect, it } from 'vitest';
import { keyboardRange } from './overlay';

describe('keyboardRange (mini keyboards follow the voicing)', () => {
  it('shows C3..C5 for voicings in that range, and when empty', () => {
    expect(keyboardRange([60, 64, 67])).toEqual([60, 84]);
    expect(keyboardRange([])).toEqual([60, 84]);
  });
  it('moves down for low voicings, so their keys are drawn', () => {
    const [lo, hi] = keyboardRange([41, 45, 48]); // F A C around F1
    expect(lo).toBeLessThanOrEqual(41);
    expect(hi).toBeGreaterThanOrEqual(48);
  });
  it('widens past two octaves when a voicing needs it', () => {
    const [lo, hi] = keyboardRange([36, 52, 55, 62]); // bass note + upper chord
    expect(lo).toBe(36);
    expect(hi).toBeGreaterThanOrEqual(62);
  });
});
