import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NoteSink } from '../core/types';
import { ListeningPlayer } from './listening-playback';
import type { PlaybackChord } from './listening-session';

const sequence: PlaybackChord[] = [
  { notes: [60, 64, 67], beats: 4, name: 'C', phase: 'context' },
  { notes: [60, 65, 69], beats: 4, name: 'F', phase: 'answer' },
];
function recordingSink() {
  const held = new Set<number>();
  const send = vi.fn((pitch: number, velocity: number) => { if (velocity) held.add(pitch); else held.delete(pitch); });
  const sink: NoteSink = { name: 'recording', send, close: () => {} };
  return { sink, held, send };
}
function callbacks() { return { onChord: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }; }

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('listening playback', () => {
  it('sustains each bar, releases shared notes before retriggering, and completes with no held notes', () => {
    const { sink, send, held } = recordingSink();
    const events = callbacks();
    new ListeningPlayer().play(sink, sequence, 120, events);
    vi.advanceTimersByTime(2159);
    expect([...held]).toEqual([60, 64, 67]);
    vi.advanceTimersByTime(1);
    expect(send.mock.calls.slice(3, 9)).toEqual([[60, 0], [64, 0], [67, 0], [60, 85], [65, 85], [69, 85]]);
    vi.runAllTimers();
    expect(held.size).toBe(0);
    expect(events.onComplete).toHaveBeenCalledOnce();
    expect(events.onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops mid-chord without sending future notes or counting completion', () => {
    const { sink, held, send } = recordingSink();
    const events = callbacks();
    const player = new ListeningPlayer();
    player.play(sink, sequence, 120, events);
    vi.advanceTimersByTime(500);
    player.stop();
    vi.runAllTimers();
    expect(held.size).toBe(0);
    expect(send.mock.calls.filter(([, velocity]) => velocity > 0)).toHaveLength(3);
    expect(events.onComplete).not.toHaveBeenCalled();
  });

  it('releases the original sink when starting playback on a different sink', () => {
    const first = recordingSink();
    const second = recordingSink();
    const player = new ListeningPlayer();
    const original = callbacks();
    player.play(first.sink, sequence, 120, original);
    vi.advanceTimersByTime(160);
    player.play(second.sink, sequence, 120, callbacks());
    expect(first.held.size).toBe(0);
    vi.runAllTimers();
    expect(second.held.size).toBe(0);
    expect(original.onComplete).not.toHaveBeenCalled();
  });

  it('attempts every note-off even when sending a note or releasing another note fails', () => {
    const send = vi.fn((pitch: number, velocity: number) => {
      if ((pitch === 67 && velocity > 0) || (pitch === 60 && velocity === 0)) throw new Error('Disconnected');
    });
    const events = callbacks();
    new ListeningPlayer().play({ name: 'failing', send, close: () => {} }, sequence, 120, events);
    vi.runAllTimers();
    expect(send.mock.calls.slice(3)).toEqual([[60, 0], [64, 0], [67, 0]]);
    expect(events.onError).toHaveBeenCalledOnce();
    expect(events.onComplete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts a stalled timer instead of bursting overdue chords', () => {
    const { sink, held, send } = recordingSink();
    const events = callbacks();
    new ListeningPlayer().play(sink, sequence, 120, events);
    vi.advanceTimersByTime(160);
    vi.spyOn(performance, 'now').mockReturnValue(10000);
    vi.advanceTimersByTime(2000);
    expect(held.size).toBe(0);
    expect(send.mock.calls.filter(([, velocity]) => velocity > 0)).toHaveLength(3);
    expect(events.onError).toHaveBeenCalledOnce();
    expect(events.onComplete).not.toHaveBeenCalled();
  });
});
