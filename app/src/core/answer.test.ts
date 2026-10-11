import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerEngine, scoreAnswer, type AnswerProgress, type AnswerSettings } from './answer';
import { detectChord } from './chords';
import type { ChordModel } from './model';
import { NgramModel } from './ngram';
import { ngramJson } from './testdata';
import type { AnswerPlan, ChordSymbol, NoteSink } from './types';
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
  /** times at which new chords started */
  chordTimes() {
    return [...new Set(this.log.filter((e) => e.velocity > 0).map((e) => e.t))];
  }
}

const V: Record<string, number[]> = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62] };
// 120 BPM: a beat is 500 ms, a bar 2000 ms, a 4-bar phrase 8000 ms.
const BAR = 2000;

function setup(over: Partial<AnswerSettings> = {}, model: ChordModel = alwaysIV) {
  vi.setSystemTime(0);
  const sink = new RecordingSink();
  const settings: AnswerSettings = { answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, phraseBars: 4, ...over };
  const progress: AnswerProgress[] = [];
  let lastPlan: AnswerPlan | null = null;
  const engine = new AnswerEngine({
    model,
    sink: () => sink,
    settings: () => settings,
    onPlan: (plan, p) => {
      lastPlan = plan;
      progress.push(p);
    },
    now: () => Date.now(),
    rng: () => 0.5,
    candidates: 8,
  });
  /** advance to `at` ms, then play a chord there (note-ons + the detector's chord) */
  const play = (name: string, at: number) => {
    vi.advanceTimersByTime(at - Date.now());
    for (const p of V[name]) engine.note({ pitch: p, velocity: 100, time: Date.now() });
    engine.chord(detectChord(V[name])!);
  };
  const until = (t: number) => vi.advanceTimersByTime(t - Date.now());
  /** Live sends /bar every 2 s from 0 up to `last`, with chords in between, all in time order */
  let nextBar = 0;
  const liveBars = (last: number, chords: [string, number][]) => {
    const events: [number, () => void][] = [];
    for (; nextBar <= last; nextBar += BAR) {
      const t = nextBar;
      events.push([t, () => (until(t), engine.bar())]);
    }
    for (const [name, at] of chords) events.push([at, () => play(name, at)]);
    events.sort((a, b) => a[0] - b[0]).forEach(([, f]) => f());
  };
  return { engine, sink, settings, progress, play, until, liveBars, plan: () => lastPlan };
}

describe('AnswerEngine (phrase call and response)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('without Live transport: answers on the downbeat right after a 4-bar phrase, for 4 bars', () => {
    const { sink, play, until } = setup();
    play('C', 0);
    play('Am', 2000);
    play('F', 4000);
    play('G', 6000);
    until(7999);
    expect(sink.log).toHaveLength(0);
    until(8000);
    expect(sink.held.size).toBe(3); // first answer chord, exactly at bar 5
    until(16000);
    // 4 answer chords, one per bar, then everything released at the end of the 4 answer bars
    expect(sink.chordTimes()).toEqual([8000, 10000, 12000, 14000]);
    expect(sink.held.size).toBe(0);
  });

  it('with Live playing: the answer starts on the /bar that ends the phrase', () => {
    const { sink, liveBars } = setup();
    liveBars(6000, [['C', 100], ['Am', 2100]]);
    expect(sink.log).toHaveLength(0);
    liveBars(8000, []);
    expect(sink.chordTimes()[0]).toBe(8000);
  });

  it('treats a chord in the last quarter of a bar as the start of the next bar', () => {
    const { sink, liveBars } = setup();
    // C at 1.8 s anticipates bar 2 (which starts at 2 s)
    liveBars(10000, [['C', 1800], ['Am', 3000]]);
    expect(sink.chordTimes()[0]).toBe(10000); // bar 2 + 4 bars = bar 6, at 10 s
  });

  it('keeps counting bars itself if Live stops mid-phrase', () => {
    const { sink, play, until, liveBars } = setup();
    liveBars(2000, [['C', 100]]); // Live sends bars at 0 and 2 s, then stops
    play('Am', 2100);
    until(20000);
    expect(sink.chordTimes().length).toBeGreaterThan(0);
    expect(sink.held.size).toBe(0);
  });

  it('spreads 2 answer chords over an 8-bar answer (4 bars each)', () => {
    const { sink, play, until } = setup({ phraseBars: 8 });
    play('C', 0);
    play('G', 4000);
    until(32000);
    expect(sink.chordTimes()).toEqual([16000, 24000]);
    expect(sink.held.size).toBe(0);
  });

  it('answers in the register the player used', () => {
    const { sink, play, until } = setup();
    play('F', 0); // F A C around F2..C3
    play('G', 2000);
    until(16000);
    const ons = sink.log.filter((e) => e.velocity > 0).map((e) => e.pitch);
    expect(Math.min(...ons)).toBeGreaterThanOrEqual(53 - 6);
    expect(Math.max(...ons)).toBeLessThanOrEqual(62 + 6);
  });

  it('plays low when the player plays low, with a bass note when they play one', () => {
    const { sink, engine, until } = setup();
    // left-hand root two octaves down + right-hand triad, low on the keyboard
    const low = { C: [36, 52, 55, 60], G: [31, 50, 55, 59] };
    for (const [name, at] of [['C', 0], ['G', 2000]] as const) {
      vi.advanceTimersByTime(at - Date.now());
      engine.chord(detectChord(low[name])!);
    }
    until(16000);
    const first = sink.log.filter((e) => e.t === 8000 && e.velocity > 0).map((e) => e.pitch).sort((a, b) => a - b);
    expect(first).toHaveLength(4); // bass + triad, like the player
    expect(first[0]).toBeLessThan(43); // bass near the player's bass line (31..36)
    expect(first[1] - first[0]).toBeGreaterThanOrEqual(7);
    expect(Math.max(...first)).toBeLessThan(66);
  });

  it('needs at least 2 chords, and stays quiet when answers are off', () => {
    const one = setup();
    one.play('C', 0);
    one.until(20000);
    expect(one.sink.log).toHaveLength(0);
    const off = setup({ answersOn: false });
    off.play('C', 0);
    off.play('F', 2000);
    off.until(20000);
    expect(off.sink.log).toHaveLength(0);
  });

  it('stops when the player comes back in, and their chord starts a new phrase', () => {
    const { sink, progress, play, until } = setup();
    play('C', 0);
    play('Am', 2000);
    until(8000);
    expect(sink.held.size).toBe(3);
    play('F', 8100); // within the answer's first beat: tail of the player's phrase, ignored
    expect(sink.held.size).toBe(3);
    play('G', 9000); // after the first beat: the player takes over
    expect(sink.held.size).toBe(0);
    expect(progress.at(-1)!.status).toBe('listening');
  });

  it('reports bar-by-bar progress', () => {
    const { progress, play, until } = setup();
    play('C', 0);
    play('Am', 2000);
    expect(progress.at(-1)).toEqual({ status: 'listening', bar: 2, bars: 4 });
    until(8000);
    expect(progress.at(-1)).toEqual({ status: 'playing', bar: 1, bars: 4 });
    until(16000);
    expect(progress.at(-1)!.status).toBe('idle');
  });

  it('keeps the last phrase and answer as timed notes for Keep', () => {
    const { engine, play, until } = setup();
    play('C', 0);
    play('Am', 2000);
    until(16000);
    expect(engine.lastPhraseNotes.filter((e) => e.velocity > 0).map((e) => e.pitch)).toEqual([...V.C, ...V.Am]);
    expect(engine.lastAnswerNotes.filter((e) => e.velocity > 0)).toHaveLength(6);
  });

  it('plans with the real n-gram: C Am F G gets an answer that resolves', () => {
    const { plan, play } = setup({ genre: 'pop' }, new NgramModel(ngramJson));
    play('C', 0);
    play('Am', 2000);
    play('F', 4000);
    play('G', 6000);
    vi.advanceTimersByTime(1); // the background plan
    const p = plan()!;
    expect(p.chords).toHaveLength(4);
    expect(p.chords.every((c) => c.voicing.every((n) => n >= 50 && n <= 74))).toBe(true); // near C Am F G as played
    const last = p.chords.at(-1)!.chord;
    expect([0, 7]).toContain(last.root); // ends on I or V
  });
});

describe('scoreAnswer', () => {
  const C = { tonic: 0, minor: false };
  const ch = (root: number, quality: ChordSymbol['quality'] = 'maj') => ({ root, quality });
  const phrase = [ch(0), ch(9, 'min'), ch(5), ch(7)];

  it('prefers ending on the tonic over ending elsewhere', () => {
    expect(scoreAnswer([ch(5), ch(7), ch(0)], -1, phrase, C)).toBeGreaterThan(scoreAnswer([ch(5), ch(7), ch(9, 'min')], -1, phrase, C));
  });

  it('penalises ping-pong and copying the player', () => {
    expect(scoreAnswer([ch(5), ch(0), ch(5)], -1, phrase, C)).toBeLessThan(scoreAnswer([ch(5), ch(2, 'min'), ch(5)].slice(0, 2).concat([ch(7)]), -1, phrase, C));
    expect(scoreAnswer([ch(9, 'min'), ch(5), ch(7)], -1, phrase, C)).toBeLessThan(scoreAnswer([ch(9, 'min'), ch(5), ch(0)], -1, phrase, C));
  });
});
