import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnsetGrouper, type NoteGroup } from './grouper';

describe('OnsetGrouper', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('groups onsets within the window and splits later ones', () => {
    const groups: NoteGroup[] = [];
    const g = new OnsetGrouper((x) => groups.push(x), 60);
    g.push({ pitch: 60, velocity: 100, time: 0 });
    vi.advanceTimersByTime(20);
    g.push({ pitch: 64, velocity: 100, time: 20 });
    g.push({ pitch: 64, velocity: 0, time: 30 }); // note off is ignored
    g.push({ pitch: 67, velocity: 100, time: 40 });
    vi.advanceTimersByTime(40);
    expect(groups).toEqual([{ pitches: [60, 64, 67], firstTime: 0 }]);
    g.push({ pitch: 65, velocity: 100, time: 500 });
    vi.advanceTimersByTime(60);
    expect(groups[1].pitches).toEqual([65]);
  });
});
