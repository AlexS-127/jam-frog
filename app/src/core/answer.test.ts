import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnswerEngine, jamBlockLength, jamRhythm, scoreAnswer, type AnswerProgress, type AnswerSettings } from './answer';
import { cached } from './cached';
import { detectChord } from './chords';
import { GruModel } from './gru';
import { isBorrowed, isDiatonic, keyName } from './key';
import { seededRng } from './listening';
import type { ChordModel } from './model';
import { NgramModel } from './ngram';
import { isSecondaryDominant } from './sampler';
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

  it('reset: forgets the phrase and the session, so the next chord starts a fresh phrase', () => {
    const { engine, sink, progress, play, until } = setup();
    play('C', 0);
    play('Am', 2000); // two bars into a phrase
    engine.reset();
    expect(engine.phraseCells()).toEqual([]);
    expect(progress.at(-1)!.status).toBe('idle');
    until(9000); // the old phrase's answer never comes
    expect(sink.log).toHaveLength(0);
    play('F', 9000);
    expect(engine.phraseCells().map((c) => c.name)).toEqual(['F']);
    expect(progress.at(-1)!.status).toBe('listening');
    engine.cancel();
  });

  it('strum mode: sends Ample chord keys from C1 and a strum key instead of the voicing; re-strikes go up, then down', () => {
    const { sink, play, until } = setup({ strum: true, rhythm: true });
    play('C', 0);
    play('C', 1000); // a re-strike of the same chord
    play('Am', 2000);
    play('F', 4000);
    play('G', 6000);
    until(8000);
    const held = [...sink.held].sort((a, b) => a - b);
    expect(held.slice(0, -1).every((p) => p >= 36 && p <= 59)).toBe(true);
    expect(held[0]).toBeLessThanOrEqual(47);
    expect(held.at(-1)).toBe(60); // C3: down
    until(9000);
    expect([...sink.held]).toContain(64); // E3: the re-strike strums up
    until(16000);
    const strumKeys = sink.log.filter((e) => e.velocity > 0 && e.pitch >= 60).map((e) => e.pitch);
    expect(new Set(strumKeys)).toEqual(new Set([60, 64]));
    expect(sink.held.size).toBe(0);
  });

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
    liveBars(6000, [['C', 100], ['Am', 2100]]); // a human 100 ms after the bar: snapped onto it
    expect(sink.log).toHaveLength(0);
    liveBars(8000, []);
    expect(sink.chordTimes()[0]).toBe(8000);
  });

  it('treats a chord in the last quarter of a bar as the start of the next bar', () => {
    const { sink, liveBars } = setup();
    // C at 1.8 s anticipates bar 2 (which starts at 2 s): the phrase is bars 2-5, the answer bars 6-9
    liveBars(10000, [['C', 1800], ['Am', 3000]]);
    // ...and the frog anticipates its bar 6 the same way: an 8th early (1.8 s is 0.4 beats early, snapped to 0.5)
    expect(sink.chordTimes()[0]).toBe(9750);
  });

  it('follows the bar length of Live, even when the BPM setting is wrong (Live 93 BPM, app still on 120)', () => {
    const { engine, progress, play, until } = setup({ bpm: 120 });
    const timedProgress: (AnswerProgress & { t: number })[] = [];
    const seen = progress.push.bind(progress);
    progress.push = (...ps: AnswerProgress[]) => {
      ps.forEach((p) => timedProgress.push({ ...p, t: Date.now() }));
      return seen(...ps);
    };
    const LIVE_BAR = 2581; // 4 beats at 93 BPM
    const bars: number[] = [];
    for (let t = 0; t <= 9 * LIVE_BAR; t += LIVE_BAR) bars.push(t);
    const chords: [string, number][] = [['C', 300], ['Am', 1500], ['F', LIVE_BAR + 300], ['G', 2 * LIVE_BAR + 300]];
    const events = [...bars.map((t) => [t, () => engine.bar()] as const), ...chords.map(([n, t]) => [t, () => play(n, t)] as const)]
      .sort((a, b) => a[0] - b[0]);
    for (const [t, f] of events) {
      until(t);
      f();
    }
    // The counter may only change at Live's bar lines: never on a chord, never from the backup clock.
    // (the phrase starting, idle -> bar 1, happens on the chord itself; that is the one allowed exception)
    const changes = timedProgress
      .filter((p, i) => i > 0 && (p.bar !== timedProgress[i - 1].bar || p.status !== timedProgress[i - 1].status))
      .filter((p, i, all) => !(p.status === 'listening' && p.bar === 1 && (i === 0 || all[i - 1].status !== 'listening')))
      .map((p) => p.t);
    expect(changes.every((t) => bars.includes(t))).toBe(true);
    expect(timedProgress.find((p) => p.status === 'playing')?.t).toBe(4 * LIVE_BAR); // phrase = Live bars 1-4
  });

  it('keeps counting bars itself if Live stops mid-phrase', () => {
    const { sink, play, until, liveBars } = setup();
    liveBars(2000, [['C', 100]]); // Live sends bars at 0 and 2 s, then stops
    play('Am', 2100);
    until(20000);
    expect(sink.chordTimes().length).toBeGreaterThan(0);
    expect(sink.held.size).toBe(0);
  });

  it('changes chord where the player did, and fills the whole answer (8 bars in, 8 bars out)', () => {
    const { sink, play, until } = setup({ phraseBars: 8 });
    play('C', 0);
    play('G', 4000); // bar 3
    until(31000);
    expect(sink.chordTimes()).toEqual([16000, 20000]); // bar 1 and bar 3 of the answer
    expect(sink.held.size).toBe(3); // the last chord is still sounding near the end of bar 8
    until(32000);
    expect(sink.held.size).toBe(0);
  });

  it('answers with as many chords as the player changed to, up to 8', () => {
    const { sink, play, until } = setup({ phraseBars: 4 });
    ['C', 'Am', 'F', 'G', 'C', 'Am'].forEach((n, i) => play(n, i * 1000));
    until(16000);
    expect(sink.chordTimes()).toHaveLength(6);
  });

  it('works with 2-bar phrases', () => {
    const { sink, play, until } = setup({ phraseBars: 2 });
    play('C', 0);
    play('F', 2000);
    until(7000);
    expect(sink.chordTimes()).toEqual([4000, 6000]);
    until(8000);
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

  it('without Live, counts bars from when the chord was struck, not when it was recognised', () => {
    const { engine, sink, until } = setup();
    for (const p of V.C) engine.note({ pitch: p, velocity: 100, time: 0 });
    until(60); // the chord detector names the chord 60 ms later
    engine.chord(detectChord(V.C)!);
    until(2000);
    for (const p of V.Am) engine.note({ pitch: p, velocity: 100, time: Date.now() });
    until(2060);
    engine.chord(detectChord(V.Am)!);
    until(8000);
    expect(sink.chordTimes()[0]).toBe(8000); // bar 5 counted from t = 0, not 60
  });

  it('reports bar-by-bar progress', () => {
    const { progress, play, until } = setup();
    play('C', 0);
    play('Am', 2000);
    expect(progress.at(-1)).toEqual({ status: 'listening', bar: 2, bars: 4, chord: -1 });
    until(8000);
    expect(progress.at(-1)).toEqual({ status: 'playing', bar: 1, bars: 4, chord: 0 });
    until(16000);
    expect(progress.at(-1)!.status).toBe('idle');
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

describe('AnswerEngine rhythm and dynamics', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** strike a chord at `at` ms with `velocity`, release it `hold` ms later (120 BPM: a beat is 500 ms) */
  function strike(engine: AnswerEngine, pitches: number[], at: number, velocity: number, hold: number) {
    vi.advanceTimersByTime(at - Date.now());
    for (const p of pitches) engine.note({ pitch: p, velocity, time: Date.now() });
    vi.advanceTimersByTime(60); // the chord detector's window
    engine.chord(detectChord(pitches)!);
    vi.advanceTimersByTime(hold - 60);
    for (const p of pitches) engine.note({ pitch: p, velocity: 0, time: Date.now() });
  }

  function rig(rhythm: boolean) {
    vi.setSystemTime(0);
    const sink = new RecordingSink();
    const engine = new AnswerEngine({
      model: alwaysIV,
      sink: () => sink,
      settings: () => ({ answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, phraseBars: 4, rhythm }),
      now: () => Date.now(),
      rng: () => 0.5, // no random velocity variation, so velocities can be checked exactly
    });
    return { engine, sink };
  }

  it('copies the rhythm: strike positions, re-strikes and lengths (on a 16th grid), from the answer', () => {
    const { engine, sink } = rig(true);
    // bar 1: C on beat 1 (held 1 beat), C again on beat 3 (held half a beat); bar 2: Am on beat 2 (held 2 beats)
    strike(engine, V.C, 0, 100, 500);
    strike(engine, V.C, 1000, 60, 250);
    strike(engine, V.Am, 2500, 80, 1000);
    vi.advanceTimersByTime(16000 - Date.now());
    const ons = sink.log.filter((e) => e.velocity > 0);
    const starts = [...new Set(ons.map((e) => e.t))];
    expect(starts).toEqual([8000, 9000, 10500]); // the same offsets, from bar 5
    const offAfter = (t: number) => sink.log.find((e) => e.velocity === 0 && e.t > t)!.t;
    expect(offAfter(8000)).toBe(8500); // held a beat
    expect(offAfter(9000)).toBe(9250); // half a beat
    expect(offAfter(10500)).toBe(11500); // two beats
    expect(sink.held.size).toBe(0);
  });

  it('follows the dynamics of each strike, top voice a little louder', () => {
    const { engine, sink } = rig(true);
    strike(engine, V.C, 0, 100, 500);
    strike(engine, V.C, 1000, 40, 250);
    strike(engine, V.Am, 2500, 80, 1000);
    vi.advanceTimersByTime(16000 - Date.now());
    const velAt = (t: number) => sink.log.filter((e) => e.t === t && e.velocity > 0).map((e) => e.velocity);
    expect(velAt(8000)).toEqual([100, 100, 105]); // loud strike: loud answer, top voice +5
    expect(velAt(9000)).toEqual([40, 40, 45]); // soft ghost strike: soft answer
  });

  it('without rhythm mode, changes chord where the player did, at the phrase\'s dynamics', () => {
    const { engine, sink } = rig(false);
    strike(engine, V.C, 0, 50, 500);
    strike(engine, V.Am, 2000, 50, 500);
    vi.advanceTimersByTime(16000 - Date.now());
    expect(sink.chordTimes()).toEqual([8000, 10000]); // bar 1 and bar 2, as played; Am then held to the end
    const first = sink.log.filter((e) => e.t === 8000 && e.velocity > 0).map((e) => e.velocity);
    expect(first).toEqual([56, 56, 61]); // soft player -> soft frog (first chord accented +6, top voice +5)
  });

  it('counts a re-struck chord once for the model and the answer length', () => {
    const { engine, sink } = rig(false);
    strike(engine, V.C, 0, 90, 300);
    strike(engine, V.C, 500, 90, 300);
    strike(engine, V.C, 1000, 90, 300);
    strike(engine, V.Am, 2000, 90, 300);
    vi.advanceTimersByTime(16000 - Date.now());
    expect(sink.chordTimes()).toHaveLength(2); // C, Am -> a 2-chord answer, not 4
  });
});

describe('AnswerEngine background planning', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // A model that takes 5 ms per call (like the GRU on a slow machine), measured on the fake clock.
  let calls = 0;
  const slowIV: ChordModel = {
    name: 'slow',
    predictNext: (ctx, genre) => {
      calls++;
      vi.setSystemTime(Date.now() + 5);
      return alwaysIV.predictNext(ctx, genre);
    },
  };

  it('plans in short slices, yielding between them, within the 150 ms budget', () => {
    vi.setSystemTime(0);
    calls = 0;
    const engine = new AnswerEngine({
      model: slowIV,
      sink: () => null,
      settings: () => ({ answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, phraseBars: 4 }),
      now: () => Date.now(),
    });
    engine.chord(detectChord([60, 64, 67])!);
    engine.chord(detectChord([57, 60, 64])!);
    const workPerTimer: number[] = [];
    for (let i = 0; i < 200 && Date.now() < 1000; i++) {
      const before = calls;
      vi.advanceTimersToNextTimer();
      if (calls > before) workPerTimer.push((calls - before) * 5); // ms of model time in that one timer
    }
    const total = workPerTimer.reduce((a, b) => a + b, 0);
    expect(workPerTimer.length).toBeGreaterThan(3); // several slices, not one long block
    expect(Math.max(...workPerTimer)).toBeLessThanOrEqual(12 + 10); // a slice, plus at most one candidate (2 calls)
    expect(total).toBeLessThanOrEqual(150 + 10);
    expect(total).toBeGreaterThanOrEqual(140); // it does use the budget to find better answers
    engine.cancel();
  });

  it('when the phrase ends mid-planning, answers with the best candidate so far', () => {
    vi.setSystemTime(0);
    const sink = new RecordingSink();
    const engine = new AnswerEngine({
      model: slowIV,
      sink: () => sink,
      settings: () => ({ answersOn: true, weirdness: 0.1, genre: 'all', bpm: 480, phraseBars: 1 }),
      now: () => Date.now(),
    });
    engine.chord(detectChord([60, 64, 67])!);
    vi.advanceTimersByTime(250);
    engine.chord(detectChord([57, 60, 64])!);
    vi.advanceTimersByTime(350); // 1 bar at 480 BPM = 500 ms; planning would need longer than that here
    expect(sink.held.size).toBe(3);
    engine.cancel();
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

describe('AnswerEngine jam mode', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function jamRig(model: ChordModel = alwaysIV) {
    vi.setSystemTime(0);
    const sink = new RecordingSink();
    const settings: AnswerSettings = { answersOn: true, weirdness: 0.1, genre: 'all', bpm: 120, phraseBars: 4, continuous: true };
    const engine = new AnswerEngine({ model, sink: () => sink, settings: () => settings, now: () => Date.now(), rng: () => 0.5 });
    const play = (pitches: number[], at: number) => {
      vi.advanceTimersByTime(at - Date.now());
      for (const p of pitches) engine.note({ pitch: p, velocity: 90, time: Date.now() });
      engine.chord(detectChord(pitches)!);
      vi.advanceTimersByTime(1500);
      for (const p of pitches) engine.note({ pitch: p, velocity: 0, time: Date.now() });
    };
    return { engine, sink, settings, play };
  }

  it("keeps playing block after block in the player's chord-change rhythm until stopped", () => {
    const { engine, sink, play } = jamRig();
    [V.C, V.Am, V.F, V.G].forEach((ch, i) => play(ch, i * 2000)); // one chord per bar
    vi.advanceTimersByTime(39999 - Date.now()); // the phrase (8 s) then 4 blocks of 8 s
    expect(sink.chordTimes()).toEqual([8000, 10000, 12000, 14000, 16000, 18000, 20000, 22000,
      24000, 26000, 28000, 30000, 32000, 34000, 36000, 38000]);
    engine.cancel(); // Stop
    expect(sink.held.size).toBe(0);
    vi.advanceTimersByTime(20000);
    expect(sink.chordTimes()).toHaveLength(16); // nothing after Stop
  });

  it('continues the progression: the answer matches your phrase, then about one chord per bar (always IV here)', () => {
    const { engine, sink, play } = jamRig();
    play(V.C, 0);
    play(V.G, 4000); // C then G: two changes per 4-bar phrase
    vi.advanceTimersByTime(23999 - Date.now());
    const names = sink.chordTimes().map((t) => detectChord(sink.log.filter((e) => e.t === t && e.velocity > 0).map((e) => e.pitch))!.name);
    // after G the answer goes C, F (your two changes); the next block carries on from F, one chord a bar
    expect(names).toEqual(['C', 'F', 'Bb', 'Eb', 'Ab', 'C#']);
    expect(sink.chordTimes()).toEqual([8000, 12000, 16000, 18000, 20000, 22000]);
    engine.cancel();
  });

  it('lets the player play along without stopping the jam', () => {
    const { engine, sink, play } = jamRig();
    play(V.C, 0);
    play(V.Am, 4000);
    vi.advanceTimersByTime(9000 - Date.now());
    play(V.F, 9000); // the player joins in during the frog's first block
    vi.advanceTimersByTime(23999 - Date.now());
    expect(sink.chordTimes()).toEqual([8000, 12000, 16000, 18000, 20000, 22000]);
    engine.cancel();
  });

  it('shows the next block ahead of time, and then plays exactly that', () => {
    const { engine, sink, play } = jamRig();
    play(V.C, 0);
    play(V.G, 4000);
    vi.advanceTimersByTime(8000 - Date.now());
    expect(engine.upcoming()).toBeNull(); // still planning
    vi.advanceTimersByTime(500);
    expect(engine.upcoming()!.chords.map((c) => c.name)).toEqual(['Bb', 'Eb', 'Ab', 'C#']);
    expect(engine.upcomingCells()).toEqual([
      { name: 'Bb', beat: 0 }, { name: 'Eb', beat: 4 }, { name: 'Ab', beat: 8 }, { name: 'C#', beat: 12 },
    ]);
    expect(engine.frogCells()).toEqual([{ name: 'C', beat: 0 }, { name: 'F', beat: 8 }]);
    vi.advanceTimersByTime(16000 - Date.now());
    const now = sink.log.filter((e) => e.t === 16000 && e.velocity > 0).map((e) => e.pitch);
    expect(detectChord(now)!.name).toBe('Bb');
    engine.cancel();
    expect(engine.upcoming()).toBeNull();
  });

  it('re-plans the next block when the weirdness changes mid-block, and plays the new plan', () => {
    const { engine, sink, settings, play } = jamRig();
    play(V.C, 0);
    play(V.G, 4000);
    vi.advanceTimersByTime(8500 - Date.now());
    const before = engine.upcoming();
    expect(before).not.toBeNull();
    vi.advanceTimersByTime(10000 - Date.now());
    settings.weirdness = 0.9;
    engine.settingsChanged();
    expect(engine.upcoming()).toBeNull(); // planning again, with the new weirdness
    vi.advanceTimersByTime(500);
    const after = engine.upcoming()!;
    expect(after).not.toBe(before);
    vi.advanceTimersByTime(16000 - Date.now());
    const now = sink.log.filter((e) => e.t === 16000 && e.velocity > 0).map((e) => e.pitch);
    expect(detectChord(now)!.name).toBe(after.chords[0].name);
    engine.cancel();
    engine.settingsChanged(); // not jamming: nothing to re-plan
    expect(engine.upcoming()).toBeNull();
  });

  it('stays in the key of the player at full weirdness instead of wandering off', () => {
    const C = { tonic: 0, minor: false };
    let diatonic = 0;
    let outside = 0;
    for (let seed = 1; seed <= 3; seed++) {
      vi.setSystemTime(0);
      const settings: AnswerSettings = { answersOn: true, weirdness: 1, genre: 'all', bpm: 120, phraseBars: 4, continuous: true };
      const blocks = new Set<AnswerPlan>();
      const engine = new AnswerEngine({
        model: new NgramModel(ngramJson), sink: () => null, settings: () => settings, now: () => Date.now(), rng: seededRng(seed),
        onPlan: (p) => p && blocks.add(p),
      });
      [V.C, V.Am, V.F, V.G].forEach((ch, i) => {
        vi.advanceTimersByTime(i * 2000 - Date.now());
        for (const p of ch) engine.note({ pitch: p, velocity: 90, time: Date.now() });
        engine.chord(detectChord(ch)!);
      });
      vi.advanceTimersByTime(8000 + 10 * 8000 - Date.now()); // 10 blocks
      engine.cancel();
      for (const b of [...blocks].slice(-10)) {
        for (const { chord } of b.chords) {
          if (isDiatonic(chord, C)) diatonic++;
          else if (!isBorrowed(chord, C) && !isSecondaryDominant(chord, C)) outside++;
        }
      }
    }
    expect(outside).toBe(0); // only borrowed chords and secondary dominants for colour
    expect(diatonic).toBeGreaterThan(0.6 * 3 * 10 * 4);
  });
});

describe('jam blocks: about one chord per bar', () => {
  it('picks one chord per bar most of the time, sometimes one fewer or one more', () => {
    expect([0.1, 0.5, 0.9].map((r) => jamBlockLength(4, () => r))).toEqual([3, 4, 5]);
    expect([0.1, 0.5, 0.9].map((r) => jamBlockLength(8, () => r))).toEqual([7, 8, 9]);
    expect([0.1, 0.5, 0.9].map((r) => jamBlockLength(2, () => r))).toEqual([2, 2, 3]);
  });

  it('lays the chords on bar lines: holds one for two bars, or splits a bar in half', () => {
    const starts = (n: number, r = 0.9) => jamRhythm(n, 4, 80, 0, () => r).map((e) => e.start);
    expect(starts(4)).toEqual([0, 4, 8, 12]);
    expect(starts(3, 0.9)).toEqual([0, 4, 8]); // the last two bars merged: the last chord held 2 bars
    expect(starts(5, 0.3)).toEqual([0, 4, 8, 12, 14]); // the last bar split: a turnaround
    const ev = jamRhythm(4, 4, 80, 0, () => 0.5);
    expect(ev.map((e) => e.chord)).toEqual([0, 1, 2, 3]);
    expect(ev[3].end).toBeCloseTo(15.92);
    expect(ev[0].velocity).toBe(86); // the first change accented
  });

  it('anticipates the first chord when the player did', () => {
    expect(jamRhythm(4, 4, 80, -0.5, () => 0.5)[0].start).toBe(-0.5);
  });
});

describe('AnswerEngine key centre and jam log', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const E: Record<string, number[]> = { E: [64, 68, 71], A: [57, 61, 64], B: [59, 63, 66], 'C#m': [61, 64, 68] };

  function rig(model: ChordModel = new NgramModel(ngramJson)) {
    vi.setSystemTime(0);
    const settings: AnswerSettings = { answersOn: true, weirdness: 0.2, genre: 'all', bpm: 120, phraseBars: 4, continuous: true };
    const engine = new AnswerEngine({ model, sink: () => null, settings: () => settings, now: () => Date.now(), rng: seededRng(7) });
    const play = (pitches: number[], at: number) => {
      vi.advanceTimersByTime(at - Date.now());
      for (const p of pitches) engine.note({ pitch: p, velocity: 90, time: Date.now() });
      engine.chord(detectChord(pitches)!);
    };
    return { engine, settings, play };
  }

  const gru = new GruModel(JSON.parse(readFileSync(new URL('../../../model/export/gru_weights.json', import.meta.url), 'utf8')));
  for (const [name, model] of [['n-gram', new NgramModel(ngramJson)], ['GRU', cached(gru)]] as const) {
    it(`shows the key once you play, and follows you to a new key mid-jam (${name})`, () => {
      const { engine, play } = rig(model);
      [V.C, V.Am, V.F, V.G].forEach((ch, i) => play(ch, i * 2000));
      expect(keyName(engine.keyCentre().key!)).toBe('C major');
      // jam along in E major for a few bars: the frog's key follows
      const tune = ['E', 'A', 'B', 'E', 'C#m', 'A', 'B', 'E', 'A', 'B', 'E', 'C#m'];
      tune.forEach((n, i) => play(E[n], 9000 + i * 1000));
      const { key, change } = engine.keyCentre();
      expect(keyName(key!)).toBe('E major');
      expect(keyName(change!.from)).toBe('C major');
      vi.advanceTimersByTime(40000 - Date.now());
      const log = engine.stop()!;
      expect(log.keyChanges.map((k) => keyName(k.to))).toEqual(['E major']);
      // from the next bar on, the frog plays in E
      const after = log.chords.filter((c) => c.who === 'frog' && c.bar > log.keyChanges[0].bar);
      const inE = after.filter((c) => isDiatonic(c.chord, { tonic: 4, minor: false }) || isBorrowed(c.chord, { tonic: 4, minor: false }));
      expect(after.length).toBeGreaterThan(6);
      expect(inE.length / after.length).toBeGreaterThan(0.75);
    }, 30000);
  }

  it('logs every chord of a jam with its bar, and returns the log on Stop', () => {
    const { engine, play } = rig(alwaysIV);
    [V.C, V.Am, V.F, V.G].forEach((ch, i) => play(ch, i * 2000));
    vi.advanceTimersByTime(24000 - Date.now()); // the opening phrase and two frog blocks
    const log = engine.stop()!;
    expect(log.chords.slice(0, 4).map((c) => [c.who, c.name, c.bar, c.beat])).toEqual([
      ['you', 'C', 1, 0], ['you', 'Am', 2, 0], ['you', 'F', 3, 0], ['you', 'G', 4, 0],
    ]);
    expect(log.chords.slice(4, 6).map((c) => [c.who, c.name, c.bar])).toEqual([['frog', 'C', 5], ['frog', 'F', 6]]);
    expect(log.chords.filter((c) => c.who === 'frog').length).toBeGreaterThanOrEqual(8);
    expect(log.startKey).toEqual({ tonic: 0, minor: false });
    expect(log.bars).toBe(13);
    expect(engine.stop()).toBeNull(); // nothing to report once stopped
  });

  it('gives no report for a plain answer (not a jam)', () => {
    const { engine, settings, play } = rig(alwaysIV);
    settings.continuous = false;
    [V.C, V.Am].forEach((ch, i) => play(ch, i * 2000));
    vi.advanceTimersByTime(10000 - Date.now());
    expect(engine.stop()).toBeNull();
  });

  it('varies the number of chords from block to block', () => {
    const { engine, play } = rig();
    [V.C, V.Am, V.F, V.G].forEach((ch, i) => play(ch, i * 2000));
    vi.advanceTimersByTime(8000 + 12 * 8000 - Date.now());
    const log = engine.stop()!;
    const perBlock = new Map<number, number>();
    for (const c of log.chords.filter((c) => c.who === 'frog' && c.bar > 8)) {
      const block = Math.floor((c.bar - 1) / 4);
      perBlock.set(block, (perBlock.get(block) ?? 0) + 1);
    }
    const counts = [...perBlock.values()].slice(0, -1); // the last block was cut short by Stop
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(counts.every((n) => n >= 3 && n <= 5)).toBe(true);
  });
});
