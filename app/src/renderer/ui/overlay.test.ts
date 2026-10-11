import { describe, expect, it } from 'vitest';
import { barSegments } from './overlay';

describe('bar display', () => {
  it('puts each chord in the bar it starts in, as long as it lasts there', () => {
    const cells = [{ name: 'C', beat: 0 }, { name: 'Am', beat: 4 }, { name: 'F', beat: 6 }, { name: 'G', beat: 12 }];
    expect(barSegments(cells, 4)).toEqual([
      [{ index: 0, name: 'C', length: 4 }],
      [{ index: 1, name: 'Am', length: 2 }, { index: 2, name: 'F', length: 2 }], // two changes in bar 2
      [{ index: -1, name: null, length: 4 }], // F held over bar 3
      [{ index: 3, name: 'G', length: 4 }],
    ]);
  });

  it('shows a chord coming in mid-bar after a held one, and drops anything past the last bar', () => {
    const segs = barSegments([{ name: 'C', beat: 0 }, { name: 'G7', beat: 7 }, { name: 'X', beat: 9 }], 2);
    expect(segs[1]).toEqual([{ index: -1, name: null, length: 3 }, { index: 1, name: 'G7', length: 1 }]);
    expect(segs).toHaveLength(2);
  });
});
