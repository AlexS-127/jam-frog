import { describe, expect, it, vi } from 'vitest';
import { AnswerEngine } from './answer';
import { detectChord } from './chords';
import type { ChordModel } from './model';
import type { NoteSink } from './types';
import { INTERVAL0, VOCAB_SIZE } from './vocab';

const iv: ChordModel = { name: 'iv', predictNext: () => { const p = new Float32Array(VOCAB_SIZE); p[INTERVAL0 + 45] = 1; return p; } };

describe('anticipated phrase, timing jitter', () => {
  it('always answers with exactly one chord per change (200 random timings)', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const problems: string[] = [];
    for (let run = 0; run < 200; run++) {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const ons: number[] = [];
      const sink: NoteSink = { name: 's', send: (_p, v) => { if (v > 0) ons.push(Date.now()); }, close() {} };
      const e = new AnswerEngine({ model: iv, sink: () => sink, now: () => Date.now(),
        settings: () => ({ answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, phraseBars: 4, rhythm: run % 2 === 1 }) });
      const events: [number, () => void][] = [];
      const barOffset = Math.round(rnd() * 15); // Live's bar messages wobble a little
      for (let t = 0; t <= 24000; t += 2000) events.push([t + barOffset, () => e.bar()]);
      const chords = [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]];
      let t = 1750 + Math.round((rnd() - 0.5) * 200);
      for (const ch of chords) {
        const at = t;
        const hold = 1800 + Math.round(rnd() * 150);
        events.push([at, () => ch.forEach((p) => e.note({ pitch: p, velocity: 90, time: Date.now() }))]);
        events.push([at + 60, () => e.chord(detectChord(ch)!)]);
        events.push([at + hold, () => ch.forEach((p) => e.note({ pitch: p, velocity: 0, time: Date.now() }))]);
        t = at + hold + Math.round(rnd() * 40);
      }
      events.sort((a, b) => a[0] - b[0]);
      for (const [at, f] of events) { vi.advanceTimersByTime(at - Date.now()); f(); }
      vi.advanceTimersByTime(30000 - Date.now());
      const starts = [...new Set(ons)];
      if (starts.length !== 4) problems.push(`run ${run}: ${starts.length} starts ${JSON.stringify(starts)}`);
      e.cancel();
      vi.useRealTimers();
    }
    expect(problems).toEqual([]);
  });
});
