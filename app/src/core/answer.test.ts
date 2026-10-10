import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerEngine, type AnswerSettings, type AnswerStatus } from './answer';
import { detectChord } from './chords';
import type { ChordModel } from './model';
import { NgramModel } from './ngram';
import { ngramJson } from './testdata';
import type { AnswerPlan, NoteSink } from './types';
import { INTERVAL0, VOCAB_SIZE } from './vocab';

// Always answers with the IV (up a fourth, major), so plans are deterministic.
const alwaysIV: ChordModel = {
  name: 'fake',
  predictNext: () => {
    const p = new Float32Array(VOCAB_SIZE);
    p[INTERVAL0 + 5 * 9] = 1;
    return p;
  },
};

class RecordingSink implements NoteSink {
  readonly name = 'rec';
  log: { t: number; pitch: number; velocity: number }[] = [];
  held = new Set<number>();
  send(pitch: number, velocity: number): void {
    this.log.push({ t: Date.now(), pitch, velocity });
    if (velocity > 0) this.held.add(pitch);
    else this.held.delete(pitch);
  }
  close(): void {}
  ons() {
    return this.log.filter((e) => e.velocity > 0);
  }
}

const C = [60, 64, 67];
const Am = [57, 60, 64];

function setup(over: Partial<AnswerSettings> = {}, model: ChordModel = alwaysIV) {
  const sink = new RecordingSink();
  const settings: AnswerSettings = { answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, ...over };
  const statuses: [AnswerStatus, AnswerPlan | null][] = [];
  const engine = new AnswerEngine({
    model,
    sink: () => sink,
    settings: () => settings,
    onPlan: (plan, status) => statuses.push([status, plan]),
    now: () => Date.now(),
    rng: () => 0.5,
  });
  /** play a chord: note-ons, the detector's chord, then note-offs 300 ms later */
  const play = (pitches: number[]) => {
    for (const p of pitches) engine.note({ pitch: p, velocity: 100, time: Date.now() });
    engine.chord(detectChord(pitches)!);
    vi.advanceTimersByTime(300);
    for (const p of pitches) engine.note({ pitch: p, velocity: 0, time: Date.now() });
  };
  return { engine, sink, settings, statuses, play };
}

describe('AnswerEngine', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('answers after 1.5 s of silence, one chord per 2 beats, and releases every note', () => {
    const { sink, play } = setup();
    play(C);
    play(Am);
    vi.advanceTimersByTime(1499);
    expect(sink.log).toHaveLength(0);
    vi.advanceTimersByTime(1);
    // Am -> IV = D, then G (IV of D): two chords, because the phrase had two
    expect(sink.ons().map((e) => e.pitch % 12).slice(0, 3).sort()).toEqual([2, 6, 9]); // D F# A
    vi.advanceTimersByTime(999);
    expect(sink.ons()).toHaveLength(3); // second chord not yet: 2 beats at 120 BPM = 1000 ms
    vi.advanceTimersByTime(1);
    expect(sink.ons()).toHaveLength(6);
    vi.advanceTimersByTime(1000);
    expect(sink.held.size).toBe(0); // nothing left hanging
  });

  it('voices answers inside C3..C5 (MIDI 60..84)', () => {
    const { sink, play } = setup();
    play([36, 40, 43]);
    play([41, 45, 48]);
    vi.advanceTimersByTime(5000);
    for (const e of sink.ons()) {
      expect(e.pitch).toBeGreaterThanOrEqual(60);
      expect(e.pitch).toBeLessThanOrEqual(84);
    }
  });

  it('needs at least 2 chords', () => {
    const { sink, play } = setup();
    play(C);
    vi.advanceTimersByTime(5000);
    expect(sink.log).toHaveLength(0);
  });

  it('stays quiet when answers are off', () => {
    const { sink, play } = setup({ answersOn: false });
    play(C);
    play(Am);
    vi.advanceTimersByTime(5000);
    expect(sink.log).toHaveLength(0);
  });

  it('does not count held keys as silence', () => {
    const { engine, sink } = setup();
    for (const ch of [C, Am]) {
      for (const p of ch) engine.note({ pitch: p, velocity: 100, time: Date.now() });
      engine.chord(detectChord(ch)!);
    }
    vi.advanceTimersByTime(5000);
    expect(sink.log).toHaveLength(0);
  });

  it('waits for the next /bar when Live is playing', () => {
    const { engine, sink, statuses, play } = setup();
    engine.bar();
    play(C);
    play(Am);
    vi.advanceTimersByTime(1500);
    expect(statuses.at(-1)![0]).toBe('waiting-for-bar');
    expect(sink.log).toHaveLength(0);
    vi.advanceTimersByTime(200);
    engine.bar();
    expect(sink.ons()).toHaveLength(3);
    expect(statuses.at(-1)![0]).toBe('playing');
  });

  it('starts right away when the transport has stopped (no /bar for a while)', () => {
    const { engine, sink, play } = setup();
    engine.bar();
    vi.advanceTimersByTime(10000); // > 1.5 bars at 120 BPM
    play(C);
    play(Am);
    vi.advanceTimersByTime(1500);
    expect(sink.ons()).toHaveLength(3);
  });

  it('stops and releases when the player comes back in', () => {
    const { engine, sink, play } = setup();
    play(C);
    play(Am);
    vi.advanceTimersByTime(1500);
    expect(sink.held.size).toBe(3);
    engine.note({ pitch: 65, velocity: 100, time: Date.now() });
    expect(sink.held.size).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(sink.ons()).toHaveLength(3); // the rest of the answer never played
  });

  it('plays 2 to 4 chords, matching the phrase length', () => {
    const { sink, play } = setup();
    for (const ch of [C, Am, C, Am, C, Am]) play(ch);
    vi.advanceTimersByTime(1500 + 4 * 1000);
    expect(sink.ons()).toHaveLength(12);
  });

  it('keeps the last phrase and answer as timed notes for Keep', () => {
    const { engine, play } = setup();
    play(C);
    play(Am);
    vi.advanceTimersByTime(4000);
    expect(engine.lastPhraseNotes.filter((e) => e.velocity > 0).map((e) => e.pitch)).toEqual([...C, ...Am]);
    expect(engine.lastAnswerNotes.filter((e) => e.velocity > 0)).toHaveLength(6);
  });

  it('samples real continuations from the n-gram', () => {
    const { engine, play } = setup({ genre: 'pop' }, new NgramModel(ngramJson));
    play(C);
    play(Am);
    const plan = engine.plan({ answersOn: true, weirdness: 0.1, genre: 'pop', bpm: 120 });
    expect(plan.chords.length).toBe(2);
    expect(plan.chords.every((c) => c.voicing.every((p) => p >= 60 && p <= 84))).toBe(true);
  });
});
