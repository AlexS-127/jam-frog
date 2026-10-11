import { chordName } from './chords';
import { estimateKey, isBorrowed, isDiatonic, KeyTracker, type Key } from './key';
import type { ChordModel } from './model';
import { isSecondaryDominant, reshape, sampleToken } from './sampler';
import { CONTEXT_CHORDS, priorFor } from './suggest';
import type { AnswerPlan, Chord, ChordSymbol, NoteEvent, NoteSink } from './types';
import { decode, encode } from './vocab';
import { registerOf, voiceInRegister } from './voicing';

export interface AnswerSettings {
  answersOn: boolean;
  weirdness: number;
  genre: string;
  /** the UI's BPM (follows Live's /tempo when the Max for Live bridge is used) */
  bpm: number;
  /** how long the player's phrase is; the frog's answer is just as long */
  phraseBars: number;
  /**
   * Copy every strike of the player's phrase (positions, lengths, re-strikes, velocities). Off: the frog
   * changes chord where the player changed chord and holds each chord until the next change.
   */
  rhythm?: boolean;
  /**
   * Jam: after the player's phrase, keep playing phrase after phrase (continuing the progression, in the
   * player's rhythm) until stopped. Off: answer once, then wait for the next phrase.
   */
  continuous?: boolean;
}

export type AnswerStatus = 'idle' | 'listening' | 'playing';

export interface AnswerProgress {
  status: AnswerStatus;
  /** 1-based bar within the phrase or the answer; 0 when idle */
  bar: number;
  bars: number;
  /** index of the answer chord sounding now, -1 when none */
  chord: number;
}

/** A chord on the display: its name and where it starts, in beats from bar 1 of its phrase or block. */
export interface Cell {
  name: string;
  beat: number;
}

/** One chord of a jam, for the jam report. */
export interface LogChord {
  /** 1-based bar from the start of the player's opening phrase, and the beat within it (0-3.x) */
  bar: number;
  beat: number;
  who: 'you' | 'frog';
  chord: ChordSymbol;
  name: string;
}

/** Everything the jam report needs: every chord (yours and the frog's), the key and its changes. */
export interface JamLog {
  chords: LogChord[];
  startKey: Key;
  keyChanges: { bar: number; from: Key; to: Key }[];
  phraseBars: number;
  bpm: number;
  /** total bars, from the opening phrase to Stop */
  bars: number;
}

export interface AnswerEngineDeps {
  model: ChordModel;
  sink: () => NoteSink | null;
  settings: () => AnswerSettings;
  onPlan?: (plan: AnswerPlan | null, progress: AnswerProgress) => void;
  /** defaults: performance.now and Math.random */
  now?: () => number;
  rng?: () => number;
  minChords?: number;
  velocity?: number;
  /** candidate answers generated per plan; the best-scoring one is played */
  candidates?: number;
}

const BEATS_PER_BAR = 4;
/** Total time for generating answer candidates in the background (the n-gram finishes well inside it). */
const PLAN_BUDGET_MS = 150;
/** Background planning works in slices this long, yielding in between. */
const PLAN_SLICE_MS = 12;
/** Budget when an answer is due and no background plan exists (blocks, so kept short). */
const QUICK_PLAN_MS = 30;
/** How many chords of the session are remembered (for the key and the model context). */
const SESSION_CHORDS = 256;

interface Strike {
  /** ms */
  onset: number;
  /** beats from bar 1 of the phrase */
  beats: number;
  /** held for this many beats; null while still held */
  len: number | null;
  velocity: number;
  /** index of its chord in the phrase's chord changes */
  chord: number;
  pitches: number[];
  open: Set<number>;
}

interface RhythmEvent {
  /** beats from the answer's first bar line */
  start: number;
  end: number;
  velocity: number;
  /** index into the answer's chords */
  chord: number;
}

/**
 * The player's strikes as the answer's: same positions, lengths and velocities. Strike k of player chord c
 * goes to answer chord floor(c * answerChords / phraseChords). Each strike ends where the player let go,
 * or just before the next strike, or at the end of the answer.
 */
export function mirrorRhythm(
  strikes: { beats: number; len: number | null; velocity: number; chord: number }[],
  phraseChords: number,
  answerChords: number,
  totalBeats: number,
): RhythmEvent[] {
  const sorted = [...strikes]
    .map((s) => ({ ...s, beats: snap(s.beats, RHYTHM_GRID) }))
    .filter((s) => s.beats < totalBeats)
    .sort((a, b) => a.beats - b.beats);
  // (strikes before 0 are anticipations of bar 1: the answer plays them before its own bar 1)
  return sorted.map((s, i) => {
    const next = i + 1 < sorted.length ? sorted[i + 1].beats : totalBeats;
    const held = s.len === null ? next - s.beats : s.len;
    const end = Math.min(s.beats + held, next - 0.08, totalBeats); // a hair before the next strike, so it re-triggers
    return {
      start: s.beats,
      end: Math.max(end, s.beats + 0.1),
      velocity: s.velocity,
      chord: Math.min(answerChords - 1, Math.floor((s.chord * answerChords) / Math.max(1, phraseChords))),
    };
  });
}

/** Grids the player's timing is snapped to (in beats): chord changes to 8ths, copied strikes to 16ths. */
const CHANGE_GRID = 0.5;
const RHYTHM_GRID = 0.25;
const snap = (beats: number, grid: number) => Math.round(beats / grid) * grid;

/**
 * The answer's chord changes where the player changed chords: each answer chord starts where the matching
 * player chord was first struck and is held until the next change; the last one to the end of the phrase.
 * Velocity is the average of that chord's strikes (the first change accented a little).
 */
export function harmonicRhythm(
  strikes: { beats: number; velocity: number; chord: number }[],
  phraseChords: number,
  answerChords: number,
  totalBeats: number,
): RhythmEvent[] {
  const starts: { beats: number; velocity: number; chord: number }[] = [];
  for (let c = 0; c < phraseChords; c++) {
    const mine = strikes.filter((s) => s.chord === c && s.beats < totalBeats);
    if (!mine.length) continue;
    const beats = snap(Math.min(...mine.map((s) => s.beats)), CHANGE_GRID);
    const velocity = mine.reduce((a, s) => a + s.velocity, 0) / mine.length;
    starts.push({ beats, velocity, chord: Math.min(answerChords - 1, Math.floor((c * answerChords) / Math.max(1, phraseChords))) });
  }
  if (!starts.length) {
    // nothing recorded: spread the answer evenly over the phrase
    return Array.from({ length: answerChords }, (_, i) => ({
      start: (i * totalBeats) / answerChords,
      end: ((i + 1) * totalBeats) / answerChords - 0.08,
      velocity: 85,
      chord: i,
    }));
  }
  starts.sort((a, b) => a.beats - b.beats);
  return starts.map((st, i) => ({
    start: st.beats,
    end: Math.max(st.beats + 0.1, i + 1 < starts.length ? starts[i + 1].beats - 0.08 : totalBeats - 0.08),
    velocity: Math.min(127, st.velocity + (i === 0 ? 6 : 0)),
    chord: st.chord,
  }));
}

/**
 * A jam block's rhythm when the frog isn't copying the player's: about one chord per bar. Fewer chords than
 * bars hold one chord for two bars, more split a bar in half (the last bar most often: a turnaround). The
 * first chord comes in early by `anticipation` beats if the player's phrase did.
 */
export function jamRhythm(chords: number, bars: number, velocity: number, anticipation: number, rng: () => number): RhythmEvent[] {
  const lens = Array.from({ length: bars }, () => BEATS_PER_BAR);
  while (lens.length > chords && lens.length > 1) {
    const j = Math.floor(rng() * (lens.length - 1));
    lens.splice(j, 2, lens[j] + lens[j + 1]);
  }
  while (lens.length < chords) {
    const whole = lens.map((l, i) => (l >= BEATS_PER_BAR ? i : -1)).filter((i) => i >= 0);
    if (!whole.length) break;
    const j = rng() < 0.5 ? whole[whole.length - 1] : whole[Math.floor(rng() * whole.length)];
    lens.splice(j, 1, lens[j] / 2, lens[j] / 2);
  }
  const total = bars * BEATS_PER_BAR;
  let at = 0;
  return lens.map((len, i) => {
    const start = i === 0 ? Math.min(0, anticipation) : at;
    at += len;
    return { start, end: Math.max(start + 0.1, at - 0.08), velocity: Math.min(127, velocity + (i === 0 ? 6 : 0)), chord: i };
  }).map((ev, i, all) => (i === all.length - 1 ? { ...ev, end: total - 0.08 } : ev));
}

/** How many chords a jam block gets: one per bar, sometimes one fewer or one more. */
export function jamBlockLength(bars: number, rng: () => number): number {
  const r = rng();
  const n = r < 0.2 ? bars - 1 : r > 0.8 ? bars + 1 : bars;
  return Math.max(2, Math.min(2 * bars, 10, n));
}

interface JamJobOptions {
  history: ChordSymbol[];
  avoid: ChordSymbol[];
  startVoicing: number[];
  key: Key;
  /** chords in the block; undefined: as many as the player's phrase had */
  length?: number;
}

interface PlanJob {
  forKey: string;
  s: AnswerSettings;
  length: number;
  key: Key;
  prior: Float32Array;
  history: ChordSymbol[];
  phrase: Chord[];
  /** chords the candidates should not just repeat */
  avoid: ChordSymbol[];
  /** the voicing the first chord leads from */
  startVoicing: number[] | null;
  cands: { chords: ChordSymbol[]; score: number }[];
  seen: Set<string>;
  tries: number;
  spent: number;
}
/** While Live sends bars, the backup clock only steps in if a bar is this late (Live stopped). */
const BACKUP_SLACK = 1.25;

/**
 * Call and response in bars. The player's phrase starts on the bar of their first chord (or the next bar,
 * if the chord comes in the last quarter of a bar) and lasts `phraseBars`. On the downbeat right after it,
 * the frog answers for the same number of bars with 2-4 chords, changing on bar lines.
 *
 * Bars come from Live (/bar from Frog Voice) while the transport runs. Otherwise, and as a fallback if the
 * transport stops mid-phrase, the engine counts bars itself from the BPM, starting at the first chord.
 * Playing again during an answer (after its first beat) cuts the answer off and starts a new phrase.
 */
export class AnswerEngine {
  /** every chord of the jam session (capped), for the model context and the key */
  private history: ChordSymbol[] = [];
  /** indices into `history` where the player started a phrase */
  private phraseStarts: number[] = [];
  private phrase: Chord[] = [];
  private status: AnswerStatus = 'idle';
  /** bars counted since the clock started; the phrase and the answer are positioned on this count */
  private barIndex = 0;
  private lastBarAt = -Infinity;
  /** whether the last bar line came from Live (true) or from the engine's own clock (false) */
  private lastBarLive = false;
  /** Live's bar length, measured between consecutive /bar messages (right even if the BPM setting is stale) */
  private liveBarMs: number | null = null;
  private prevLiveBarAt = -Infinity;
  private phraseStart = 0;
  private answerStart = 0;
  private plan: AnswerPlan | null = null;
  private planFor = '';
  private sounding = new Set<number>();
  /** every strike of the current phrase (re-strikes too), for rhythm and dynamics */
  private strikes: Strike[] = [];
  /** when bar 1 of the current phrase starts (ms) */
  private phraseStartTime = 0;
  /** the answer locked in for this phrase: its chords and its timed events (from the player's phrase) */
  private prepared: { key: string; plan: AnswerPlan; events: RhythmEvent[] } | null = null;
  private currentChord = -1;
  /**
   * jam mode: the progression so far (the player's + the frog's), the next block planned ahead, and the key,
   * fixed to the player's when the jam starts (taking it from the frog's own chords lets it drift away)
   */
  private jam: {
    history: ChordSymbol[];
    key: Key;
    next: { key: string; plan: AnswerPlan; events: RhythmEvent[] } | null;
    job: PlanJob | null;
    /** the next block has started sounding early (an anticipation): it can no longer be re-planned */
    committed: boolean;
  } | null = null;
  private jamTimer: ReturnType<typeof setTimeout> | null = null;
  /** the events of the block on the display (kept after it ends, for the display) */
  private shown: { plan: AnswerPlan; events: RhythmEvent[] } | null = null;
  private loggedPlan: AnswerPlan | null = null;
  /** the key centre shown and jammed in (changes only once the player has clearly moved) */
  private keys = new KeyTracker();
  private keyChange: { from: Key; to: Key; at: number } | null = null;
  /** the chords of the current phrase and jam, for the jam report */
  private log: { startBar: number; chords: LogChord[]; keyChanges: JamLog['keyChanges']; startKey: Key | null } | null = null;
  private noteTimers: ReturnType<typeof setTimeout>[] = [];
  private clock: ReturnType<typeof setTimeout> | null = null;
  private planTimer: ReturnType<typeof setTimeout> | null = null;
  private job: PlanJob | null = null;

  /** the player's recent notes, to find when a phrase's first chord was struck */
  private phraseNotes: NoteEvent[] = [];

  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly minChords: number;
  private readonly velocity: number;
  private readonly candidates: number;

  constructor(private readonly d: AnswerEngineDeps) {
    this.now = d.now ?? (() => performance.now());
    this.rng = d.rng ?? Math.random;
    this.minChords = d.minChords ?? 2;
    this.velocity = d.velocity ?? 85;
    this.candidates = d.candidates ?? 48;
  }

  // ---- inputs ----

  /** every note the player plays */
  note(e: NoteEvent): void {
    this.phraseNotes.push(e);
    if (e.velocity === 0) {
      // A strike ends when all of its notes are released.
      for (const st of this.strikes) {
        if (st.len !== null || !st.pitches.includes(e.pitch)) continue;
        st.open.delete(e.pitch);
        if (st.open.size === 0) st.len = (e.time - st.onset) / this.beatLen();
      }
    }
  }

  /** every chord the player plays (from the chord detector) */
  chord(c: Chord): void {
    // The models and the key see each chord change once (the training data has repeats collapsed);
    // re-strikes of the same chord only count for the rhythm.
    const last = this.history[this.history.length - 1];
    const changed = !last || last.root !== c.root || last.quality !== c.quality;
    if (changed) {
      this.history.push({ root: c.root, quality: c.quality });
      if (this.history.length > SESSION_CHORDS) {
        this.history.shift();
        this.phraseStarts = this.phraseStarts.map((i) => i - 1).filter((i) => i >= 0);
      }
    }

    if (this.status === 'playing' && this.jam) {
      // jamming: the player plays along (only Stop ends it); if they move to a new key, the frog follows
      if (changed) {
        this.logChord('you', c);
        this.trackKey();
      }
      return;
    }
    if (this.status === 'playing') {
      // A chord in the answer's first beat is the tail of the player's phrase; later, the player takes over.
      if (this.now() - this.lastBarAt < this.beatMs() && this.barIndex === this.answerStart) return;
      this.stopAnswer();
    }
    if (this.status === 'idle') this.startPhrase();
    const prev = this.phrase[this.phrase.length - 1];
    const change = !prev || prev.root !== c.root || prev.quality !== c.quality;
    if (change) {
      this.phrase.push(c);
      this.logChord('you', c);
    }
    if (changed) this.trackKey();
    this.recordStrike(c);
    if (change) this.schedulePlan();
    this.emit();
  }

  /** Where in the phrase this chord was struck, how hard, and (once released) for how long. */
  private recordStrike(c: Chord): void {
    const t = this.now();
    const ons = this.phraseNotes.filter((n) => n.velocity > 0 && n.time >= t - 250 && c.pitches.includes(n.pitch));
    const onset = ons.length ? Math.min(...ons.map((n) => n.time)) : t;
    const velocity = ons.length ? ons.reduce((a, n) => a + n.velocity, 0) / ons.length : this.velocity;
    this.strikes.push({
      onset,
      // negative when the phrase's first chord anticipates bar 1; the answer anticipates its bar 1 the same way
      beats: Math.max(-BEATS_PER_BAR / 2, (onset - this.phraseStartTime) / this.beatLen()),
      len: null,
      velocity,
      chord: this.phrase.length - 1,
      pitches: [...c.pitches],
      open: new Set(c.pitches),
    });
  }

  /** One beat on the bar grid in use (Live's measured bar / 4, or the BPM setting). */
  private beatLen(): number {
    return this.barMs() / BEATS_PER_BAR;
  }

  /** The chords of the phrase in progress (or the last one), for the overlay's trail. */
  phraseChords(): string[] {
    return this.phrase.map((c) => c.name);
  }

  /** Jam mode: the block the frog plays after this one, once it is planned (null otherwise). */
  upcoming(): AnswerPlan | null {
    return this.status === 'playing' ? (this.jam?.next?.plan ?? null) : null;
  }

  /** Where each chord of the player's phrase starts (beats from the phrase's bar 1), for the bar display. */
  phraseCells(): Cell[] {
    return this.phrase.map((c, i) => {
      const mine = this.strikes.filter((st) => st.chord === i);
      const beat = mine.length ? snap(Math.min(...mine.map((st) => st.beats)), CHANGE_GRID) : i * BEATS_PER_BAR;
      return { name: c.name, beat: Math.max(0, beat) };
    });
  }

  /** The frog's chords on the display (the block playing, or the last one) with their start beats. */
  frogCells(): Cell[] {
    if (!this.plan) return [];
    const events = this.shown?.plan === this.plan ? this.shown.events : null;
    return cellsOf(this.plan, events);
  }

  /** Jam mode: the next block's chords and start beats, once planned. */
  upcomingCells(): Cell[] {
    const next = this.status === 'playing' ? this.jam?.next : null;
    return next ? cellsOf(next.plan, next.events) : [];
  }

  /** The key centre (null before the first chords), and the latest key change. */
  keyCentre(): { key: Key | null; change: { from: Key; to: Key; at: number } | null } {
    return { key: this.keys.key, change: this.keyChange };
  }

  /** The bar grid in use: when the latest bar started and how long a bar is (for the frog's dance). */
  barClock(): { at: number; ms: number } {
    return { at: Number.isFinite(this.lastBarAt) ? this.lastBarAt : 0, ms: this.barMs() };
  }

  /** Stop: ends a jam and returns its log for the jam report (null if the frog wasn't jamming). */
  stop(): JamLog | null {
    const log = this.jam && this.log && this.log.startKey ? this.log : null;
    const s = this.d.settings();
    const bars = this.barIndex - (log?.startBar ?? 0) + 1;
    this.cancel();
    if (!log || !log.chords.some((c) => c.who === 'frog')) return null;
    return { chords: log.chords, startKey: log.startKey!, keyChanges: log.keyChanges, phraseBars: s.phraseBars, bpm: s.bpm, bars };
  }

  /** The session's key: every chord so far, recent phrases weighted most, phrase openings as tonic cues. */
  key(): Key {
    return estimateKey(this.history, { phraseStarts: this.phraseStarts });
  }

  /** a /bar from Frog Voice: Live's transport is running and a bar just started */
  bar(): void {
    this.tick(true);
  }

  /** release everything and go back to waiting for a phrase */
  cancel(): void {
    this.stopAnswer();
    this.stopClock();
    this.phrase = [];
    this.phraseNotes = [];
    this.status = 'idle';
    this.emit();
  }

  // ---- bar clock ----

  private beatMs(): number {
    return 60000 / (this.d.settings().bpm || 120);
  }

  /** Bar length: measured from Live while its bars are coming in, otherwise 4 beats at the BPM setting. */
  private barMs(): number {
    if (this.lastBarLive && this.liveBarMs && this.now() - this.lastBarAt < 2 * this.liveBarMs) return this.liveBarMs;
    return BEATS_PER_BAR * this.beatMs();
  }

  private transportRunning(): boolean {
    return this.now() - this.lastBarAt < 1.5 * this.barMs();
  }

  /** One bar line. From Live (`live`) or from the engine's own clock when Live's transport is stopped. */
  private tick(live: boolean): void {
    if (live) {
      const gap = this.now() - this.prevLiveBarAt;
      if (gap > 250 && gap < 10000) this.liveBarMs = gap;
      this.prevLiveBarAt = this.now();
    }
    if (live || this.status !== 'idle') {
      this.barIndex++;
      this.lastBarAt = this.now();
      this.lastBarLive = live;
    }
    // Keep a fallback tick running while busy: Live's next /bar normally arrives first and re-arms it.
    this.stopClock();
    if (this.status !== 'idle') {
      this.clock = setTimeout(() => this.tick(false), this.barMs() * (live ? this.backupSlack() : 1));
    }
    this.onBar();
  }

  /** How late a Live bar may be before the backup clock steps in: more slack until Live's bar length is known. */
  private backupSlack(): number {
    return this.liveBarMs ? BACKUP_SLACK : 1.5;
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
  }

  private startPhrase(): void {
    this.log = null; // set up below, once the phrase's bar 1 is known
    this.phrase = [];
    this.strikes = [];
    this.prepared = null;
    this.phraseStarts.push(this.history.length - 1);
    // Notes from just before this chord belong to it (the chord detector waits ~60 ms); older ones don't.
    const t = this.now();
    this.phraseNotes = this.phraseNotes.filter((n) => n.time >= t - 150);
    const intoBar = t - this.lastBarAt;
    if (intoBar < 1.5 * this.barMs()) {
      // A bar grid is running (Live's, or ours from the last phrase): stay on it. A chord in the last
      // quarter of a bar is an anticipation of the next bar.
      this.phraseStart = intoBar > 0.75 * this.barMs() ? this.barIndex + 1 : this.barIndex;
      this.phraseStartTime = this.lastBarAt + (this.phraseStart - this.barIndex) * this.barMs();
      if (!this.clock) {
        const untilNext = Math.max(0, this.barMs() - (intoBar % this.barMs()));
        const slack = this.lastBarLive ? (this.backupSlack() - 1) * this.barMs() : 0;
        this.clock = setTimeout(() => this.tick(false), untilNext + slack);
      }
    } else {
      // No grid: bar 1 of the phrase starts when this chord was struck (its first note-on, which the
      // chord detector saw up to ~60 ms before it named the chord).
      const onsets = this.phraseNotes.filter((n) => n.velocity > 0).map((n) => n.time);
      const struck = onsets.length ? Math.min(...onsets) : t;
      this.barIndex = 0;
      this.lastBarAt = struck;
      this.lastBarLive = false;
      this.phraseStart = 0;
      this.phraseStartTime = struck;
      this.stopClock();
      this.clock = setTimeout(() => this.tick(false), Math.max(0, this.barMs() - (t - struck)));
    }
    this.log = { startBar: this.phraseStart, chords: [], keyChanges: [], startKey: null };
    this.status = 'listening';
  }

  /** Where we are now in the log's bars (1-based bar, beat within it); before bar 1 counts as bar 1, beat 0. */
  private logPosition(): { bar: number; beat: number } {
    const beats = Math.max(0, (this.barIndex - this.log!.startBar) * BEATS_PER_BAR + (this.now() - this.lastBarAt) / this.beatLen());
    const bar = Math.floor(beats / BEATS_PER_BAR);
    return { bar: bar + 1, beat: Math.round((beats - bar * BEATS_PER_BAR) * 4) / 4 };
  }

  private logChord(who: 'you' | 'frog', c: ChordSymbol): void {
    if (!this.log) return;
    this.log.chords.push({ ...this.logPosition(), who, chord: { root: c.root, quality: c.quality }, name: chordName(c.root, c.quality) });
  }

  /** Update the key centre from the player's chords; a confirmed key change is logged and the jam follows it. */
  private trackKey(): void {
    const from = this.keys.update(this.key());
    const to = this.keys.key!;
    if (!from) return;
    this.keyChange = { from, to, at: this.now() };
    if (this.log?.startKey) this.log.keyChanges.push({ bar: this.logPosition().bar, from, to });
    const jam = this.jam;
    if (!jam || this.status !== 'playing') return;
    // Follow the player: the new key, and their latest chords as the model's context (otherwise the model
    // carries on from the frog's own chords in the old key). Re-plan the next block unless it has started.
    jam.key = to;
    jam.history.push(...this.history.slice(-4));
    if (jam.committed) return;
    const s = this.d.settings();
    if (this.barIndex - this.answerStart < s.phraseBars - 1) this.planNextBlock(s);
    else {
      // the block ends within a bar: plan it now, quickly
      if (this.jamTimer) clearTimeout(this.jamTimer);
      this.jamTimer = null;
      jam.next = null;
      jam.job = null;
      this.lockNextBlock(s);
    }
    this.emit();
  }

  private onBar(): void {
    const s = this.d.settings();
    if (this.status === 'listening' && this.barIndex >= this.phraseStart + s.phraseBars) {
      if (s.answersOn && this.phrase.length >= this.minChords) this.startAnswer(s);
      else this.cancel();
      return;
    }
    if (this.status === 'listening' && this.barIndex === this.phraseStart + s.phraseBars - 1) {
      this.scheduleAnticipations(s); // the phrase's last bar: strikes that come before the answer's bar 1
    }
    if (this.status === 'playing') {
      const bar = this.barIndex - this.answerStart;
      if (bar >= s.phraseBars && this.jam && s.continuous && s.answersOn) {
        this.nextBlock(s);
        return;
      }
      if (bar >= s.phraseBars) {
        this.stopAnswer();
        this.cancel();
        return;
      }
      this.playBar(bar);
      if (this.jam && bar === s.phraseBars - 1) {
        this.scheduleAnticipations(s, () => {
          this.jam!.committed = true;
          return this.lockNextBlock(this.d.settings());
        }, () => this.status === 'playing' && !!this.jam);
      }
    }
    this.emit();
  }

  // ---- answering ----

  private startAnswer(s: AnswerSettings): void {
    const prepared = this.prepare(s);
    this.cancelPlanning();
    this.phraseNotes = [];
    this.plan = prepared.plan;
    this.status = 'playing';
    this.answerStart = this.barIndex;
    this.shown = prepared;
    if (s.continuous) {
      const key = this.keys.key ?? this.key();
      this.jam = { history: [...this.history, ...prepared.plan.chords.map((c) => c.chord)], key, next: null, job: null, committed: false };
      if (this.log) this.log.startKey = key;
      this.planNextBlock(s);
    }
    this.playBar(0);
    this.emit();
  }

  // ---- jam: keep playing until stopped ----

  /** Plan the next block in the background (sliced like the answer planning) while this one plays. */
  private planNextBlock(s: AnswerSettings): void {
    const jam = this.jam;
    if (!jam || !this.prepared) return;
    const current = this.prepared.plan.chords;
    const job = this.newJob(s, this.jamJob(s, jam.history, current, jam.key));
    jam.job = job;
    jam.next = null;
    const slice = () => {
      this.jamTimer = null;
      if (this.jam !== jam || jam.job !== job) return;
      this.workOn(job, PLAN_SLICE_MS);
      if (job.tries < this.candidates && job.spent < PLAN_BUDGET_MS) {
        this.jamTimer = setTimeout(slice, 0);
        return;
      }
      jam.next = this.blockFrom(job);
      jam.job = null;
      this.emit(); // the next block is ready to show
    };
    this.jamTimer = setTimeout(slice, 0);
  }

  /** A jam block's job: continue the jam in its key, about one chord per bar (or the player's rhythm, copied). */
  private jamJob(s: AnswerSettings, history: ChordSymbol[], current: AnswerPlan['chords'], key: Key): JamJobOptions {
    return {
      history,
      avoid: current.map((c) => c.chord),
      startVoicing: current[current.length - 1].voicing,
      key,
      length: s.rhythm ? undefined : jamBlockLength(s.phraseBars, this.rng),
    };
  }

  private blockFrom(job: PlanJob): { key: string; plan: AnswerPlan; events: RhythmEvent[] } {
    const plan = this.finishJob(job);
    const events = job.s.rhythm
      ? this.eventsFor(job.s, plan)
      : jamRhythm(plan.chords.length, job.s.phraseBars, this.phraseVelocity(), this.anticipation(job.s), this.rng);
    return { key: job.forKey, plan, events };
  }

  /** The player's average strike velocity (the frog's jam blocks follow their dynamics). */
  private phraseVelocity(): number {
    return this.strikes.length ? this.strikes.reduce((a, st) => a + st.velocity, 0) / this.strikes.length : this.velocity;
  }

  /** How early (beats, <= 0) the player's phrase came in before its bar 1, as the answer's events have it. */
  private anticipation(s: AnswerSettings): number {
    const first = harmonicRhythm(this.strikes, this.phrase.length, 2, s.phraseBars * BEATS_PER_BAR)[0];
    return first ? Math.min(0, first.start) : 0;
  }

  /** The next block, now: planned ahead if ready, else the best candidate so far, else a quick plan. */
  private lockNextBlock(s: AnswerSettings): { key: string; plan: AnswerPlan; events: RhythmEvent[] } {
    const jam = this.jam!;
    if (!jam.next) {
      if (jam.job && jam.job.cands.length) jam.next = this.blockFrom(jam.job);
      else {
        const current = this.prepared!.plan.chords;
        const job = this.newJob(s, this.jamJob(s, jam.history, current, jam.key));
        this.workOn(job, QUICK_PLAN_MS, 8);
        jam.next = this.blockFrom(job);
      }
      jam.job = null;
      if (this.jamTimer) clearTimeout(this.jamTimer);
      this.jamTimer = null;
    }
    return jam.next;
  }

  private nextBlock(s: AnswerSettings): void {
    const jam = this.jam!;
    const next = this.lockNextBlock(s);
    jam.next = null;
    jam.committed = false;
    jam.history.push(...next.plan.chords.map((c) => c.chord));
    if (jam.history.length > SESSION_CHORDS) jam.history.splice(0, jam.history.length - SESSION_CHORDS);
    this.prepared = { key: next.key, plan: next.plan, events: next.events };
    this.shown = this.prepared;
    this.plan = next.plan;
    this.answerStart = this.barIndex;
    this.playBar(0);
    this.planNextBlock(s);
    this.emit();
  }

  /** The answer's timed events for a plan, from the player's phrase (rhythm or chord changes). */
  private eventsFor(s: AnswerSettings, plan: AnswerPlan): RhythmEvent[] {
    const total = s.phraseBars * BEATS_PER_BAR;
    const n = plan.chords.length;
    return s.rhythm
      ? mirrorRhythm(this.strikes, this.phrase.length, n, total)
      : harmonicRhythm(this.strikes, this.phrase.length, n, total);
  }

  /**
   * Lock in the answer for this phrase: the background plan (or the best candidate so far, or a quick plan),
   * and its timed events taken from the player's phrase. Once locked (an anticipated strike may lock it
   * before the bar), it stays.
   */
  private prepare(s: AnswerSettings): { plan: AnswerPlan; events: RhythmEvent[] } {
    const key = this.phraseKey();
    if (this.prepared) return this.prepared;
    let plan: AnswerPlan;
    if (this.planFor === key && this.plan) plan = this.plan;
    else if (this.job && this.job.forKey === key && this.job.cands.length) plan = this.finishJob(this.job);
    else plan = this.makePlan(s, QUICK_PLAN_MS);
    this.prepared = { key, plan, events: this.eventsFor(s, plan) };
    return this.prepared;
  }

  /**
   * In the phrase's last bar: if the phrase opened with an anticipation (a strike before its bar 1), the answer
   * anticipates its bar 1 the same way. Those strikes are timed back from the coming bar line.
   */
  private scheduleAnticipations(
    s: AnswerSettings,
    lock: () => { plan: AnswerPlan; events: RhythmEvent[] } = () => this.prepare(this.d.settings()),
    stillDue: () => boolean = () => this.status === 'listening',
  ): void {
    if (!s.answersOn || this.phrase.length < this.minChords) return;
    // The same mapping prepare() will use (so the timers line up with the events), before the plan is locked.
    const n = Math.min(8, Math.max(2, this.phrase.length));
    const total = s.phraseBars * BEATS_PER_BAR;
    const shape = (s.rhythm ? mirrorRhythm : harmonicRhythm)(this.strikes, this.phrase.length, n, total);
    const early = shape.filter((ev) => ev.start < 0).map((ev) => ev.start);
    if (!early.length) return;
    const beat = this.beatLen();
    const barLine = this.lastBarAt + this.barMs();
    for (const start of new Set(early)) {
      const at = barLine + start * beat - this.now();
      this.noteTimers.push(setTimeout(() => {
        if (!stillDue()) return;
        const { plan, events } = lock();
        for (const ev of events) if (Math.abs(ev.start - start) < 1e-6) this.playEvent(ev, plan);
      }, Math.max(0, at)));
    }
  }

  /** Schedule the answer events that start in this bar, timed from this bar line (so they never drift). */
  private playBar(bar: number): void {
    const prepared = this.prepared;
    if (!prepared) return;
    const beat = this.beatLen();
    for (const ev of prepared.events) {
      if (ev.start < 0 || Math.floor(ev.start / BEATS_PER_BAR) !== bar) continue;
      const at = (ev.start - bar * BEATS_PER_BAR) * beat;
      // On the bar line itself: play now, in the bar tick (a 0 ms timer still fires a little late).
      if (at < 1) this.playEvent(ev, prepared.plan);
      else this.noteTimers.push(setTimeout(() => this.playEvent(ev, prepared.plan), at));
    }
  }

  private playEvent(ev: RhythmEvent, plan: AnswerPlan): void {
    const voicing = plan.chords[ev.chord].voicing;
    if (ev.chord !== this.currentChord || plan !== this.loggedPlan) this.logChord('frog', plan.chords[ev.chord].chord);
    this.loggedPlan = plan;
    for (const p of [...this.sounding]) this.send(p, 0); // the previous chord ends where this one starts
    voicing.forEach((p, i) => this.send(p, this.humanize(ev.velocity, i, voicing.length)));
    this.currentChord = ev.chord;
    this.emit();
    this.noteTimers.push(setTimeout(() => {
      for (const p of voicing) this.send(p, 0);
    }, (ev.end - ev.start) * this.beatLen()));
  }

  /** Per-note velocity: the strike's velocity, the top voice a little louder, and a small random variation. */
  private humanize(velocity: number, index: number, count: number): number {
    const top = index === count - 1 ? 5 : 0;
    const jitter = Math.round((this.rng() - 0.5) * 10);
    return Math.max(1, Math.min(127, Math.round(velocity + top + jitter)));
  }

  private cancelPlanning(): void {
    if (this.planTimer) clearTimeout(this.planTimer);
    this.planTimer = null;
    this.job = null;
  }

  private stopAnswer(): void {
    this.cancelPlanning();
    if (this.jamTimer) clearTimeout(this.jamTimer);
    this.jamTimer = null;
    this.jam = null;
    this.noteTimers.forEach(clearTimeout);
    this.noteTimers = [];
    this.prepared = null;
    this.currentChord = -1;
    for (const p of [...this.sounding]) this.send(p, 0);
    if (this.status === 'playing') this.status = 'idle';
  }

  private send(pitch: number, velocity: number): void {
    if (velocity > 0) this.sounding.add(pitch);
    else if (this.sounding.has(pitch)) this.sounding.delete(pitch);
    else return; // never send a note-off for a note that isn't sounding
    this.d.sink()?.send(pitch, velocity);
  }

  private phraseKey(): string {
    const s = this.d.settings();
    return `${this.d.model.name}|${this.phrase.map((c) => c.name).join(' ')}|${s.weirdness}|${s.genre}|${s.phraseBars}|${s.rhythm ? 'r' : ''}`;
  }

  /**
   * Plan in the background after each chord, so the answer is ready the moment the phrase ends. The work is
   * cut into ~12 ms slices with a yield between them, so incoming notes and Live's /bar are never held up,
   * for up to PLAN_BUDGET_MS in total.
   */
  private schedulePlan(): void {
    this.cancelPlanning();
    if (this.status !== 'listening' || this.phrase.length < this.minChords) return;
    const job = this.newJob(this.d.settings());
    this.job = job;
    const slice = () => {
      this.planTimer = null;
      if (this.job !== job) return;
      this.workOn(job, PLAN_SLICE_MS);
      if (job.tries < this.candidates && job.spent < PLAN_BUDGET_MS) {
        this.planTimer = setTimeout(slice, 0);
        return;
      }
      this.plan = this.finishJob(job);
      this.planFor = job.forKey;
      this.job = null;
      this.emit();
    };
    this.planTimer = setTimeout(slice, 0);
  }

  /** Plan right now (used when no background plan is ready, and by tests), within `budgetMs`. */
  makePlan(s: AnswerSettings, budgetMs = PLAN_BUDGET_MS): AnswerPlan {
    const job = this.newJob(s);
    this.workOn(job, budgetMs, 8);
    return this.finishJob(job);
  }

  /**
   * A planning job. Answers continue the session's history and avoid echoing the player's phrase; jam blocks
   * continue the jam's progression in the jam's key, avoid repeating the previous block, and voice-lead from
   * its last chord.
   */
  private newJob(s: AnswerSettings, jam?: JamJobOptions): PlanJob {
    return {
      forKey: this.phraseKey(),
      s,
      // answers: one chord per chord change in the phrase (up to 8), so every change has a partner
      length: jam?.length ?? Math.min(8, Math.max(2, this.phrase.length)),
      key: jam?.key ?? this.key(),
      prior: priorFor(this.d.model, s.genre),
      history: [...(jam?.history ?? this.history)],
      phrase: [...this.phrase],
      avoid: jam?.avoid ?? this.phrase,
      startVoicing: jam?.startVoicing ?? this.phrase.at(-1)?.pitches ?? null,
      cands: [],
      seen: new Set(),
      tries: 0,
      spent: 0,
    };
  }

  /**
   * Generate candidate continuations with the weirdness sampler for up to `ms` (always at least one, and at
   * least `minTries` in total), scoring each with `scoreAnswer`.
   */
  private workOn(job: PlanJob, ms: number, minTries = 1): void {
    const t0 = this.now();
    let made = 0;
    while (job.tries < this.candidates && (made === 0 || job.tries < minTries || this.now() - t0 < ms)) {
      made++;
      job.tries++;
      const ctx = [...job.history];
      const chords: ChordSymbol[] = [];
      let logp = 0;
      for (let i = 0; i < job.length; i++) {
        const recent = ctx.slice(-CONTEXT_CHORDS);
        const prev = recent[recent.length - 1];
        const probs = this.d.model.predictNext(encode(recent), job.s.genre);
        const dist = reshape(probs, { weirdness: job.s.weirdness, prev, key: job.key, prior: job.prior });
        const t = sampleToken(dist, this.rng);
        logp += Math.log(probs[t] || 1e-9);
        const chord = decode(prev.root, t)!;
        chords.push(chord);
        ctx.push(chord);
      }
      const id = chords.map((c) => `${c.root}${c.quality}`).join(' ');
      if (job.seen.has(id)) continue;
      job.seen.add(id);
      job.cands.push({ chords, score: scoreAnswer(chords, logp / job.length, job.avoid, job.key, job.s.weirdness) });
    }
    job.spent += this.now() - t0;
  }

  /** Low weirdness takes the top score; higher weirdness picks among good candidates in proportion to score. */
  private finishJob(job: PlanJob): AnswerPlan {
    const s = job.s;
    const cands = [...job.cands].sort((a, b) => b.score - a.score);
    let pick = cands[0];
    if (s.weirdness > 0.3 && cands.length > 1) {
      const temp = 0.15 + 0.6 * s.weirdness;
      const top = cands.slice(0, 12);
      const weights = top.map((c) => Math.exp((c.score - top[0].score) / temp));
      let r = this.rng() * weights.reduce((a, b) => a + b, 0);
      pick = top.find((_, i) => (r -= weights[i]) <= 0) ?? top[0];
    }
    // Play where the player played: their phrase's register (and bass line, if they had one).
    const reg = registerOf(job.phrase.map((c) => c.pitches)) ?? { lo: 60, hi: 84, bass: null };
    let prevVoicing: number[] | null = job.startVoicing;
    const chords = pick.chords.map((chord) => {
      const voicing = voiceInRegister(chord, prevVoicing, reg);
      prevVoicing = voicing;
      return { chord, name: chordName(chord.root, chord.quality), voicing };
    });
    return { chords, beatsPerChord: (s.phraseBars * BEATS_PER_BAR) / chords.length };
  }

  private emit(): void {
    const s = this.d.settings();
    const bar =
      this.status === 'listening'
        ? Math.min(s.phraseBars, Math.max(1, this.barIndex - this.phraseStart + 1))
        : this.status === 'playing'
          ? this.barIndex - this.answerStart + 1
          : 0;
    const chord = this.status === 'playing' ? this.currentChord : -1;
    this.d.onPlan?.(this.plan, { status: this.status, bar, bars: s.phraseBars, chord });
  }
}

/**
 * How good an answer sounds, on top of how likely the model finds it (mean log-probability):
 * ending on the tonic is a full cadence, ending on V a half cadence; bouncing back and forth
 * (A B A) and repeating the player's own phrase chord for chord count against it.
 * Staying in key: chords outside the key (not borrowed, not secondary dominants) count against it; colour
 * chords (borrowed, secondary dominants) are fine up to `weirdness` x 2 per answer, but not back to back
 * (a run of them modulates), and the answer should end back in the key. Power chords only if the player
 * played some.
 */
export function scoreAnswer(chords: ChordSymbol[], meanLogp: number, phrase: ChordSymbol[], key: Key, weirdness = 0): number {
  const same = (a: ChordSymbol, b: ChordSymbol) => a.root === b.root && a.quality === b.quality;
  const last = chords[chords.length - 1];
  const tonicQuality = key.minor ? ['min', 'min7'] : ['maj', 'maj7'];
  let score = meanLogp;
  if (last.root === key.tonic && tonicQuality.includes(last.quality)) score += 1.0;
  else if (last.root === (key.tonic + 7) % 12 && (last.quality === 'maj' || last.quality === 'dom7')) score += 0.4;
  for (let i = 2; i < chords.length; i++) if (same(chords[i], chords[i - 2])) score -= 0.7;
  // A response, not an echo: each chord that repeats the player's phrase at the same position costs.
  const tail = phrase.slice(-chords.length);
  if (tail.length === chords.length) score -= 0.6 * tail.filter((c, i) => same(c, chords[i])).length;
  if (chords.length >= 2 && phrase.length && same(chords[0], phrase[phrase.length - 1])) score -= 0.5;
  const inKey = chords.map((c) => isDiatonic(c, key));
  for (const c of chords) if (!isDiatonic(c, key) && !isBorrowed(c, key) && !isSecondaryDominant(c, key)) score -= 0.5;
  const colour = inKey.filter((d) => !d).length;
  score -= 0.6 * Math.max(0, colour - Math.round(2 * weirdness));
  for (let i = 1; i < chords.length; i++) if (!inKey[i] && !inKey[i - 1]) score -= 0.3;
  if (!inKey[inKey.length - 1]) score -= 0.6;
  // power chords only if the player plays them (rare moves get a boost when weird, and these drift to rock)
  if (!phrase.some((c) => c.quality === 'pow')) score -= 0.4 * chords.filter((c) => c.quality === 'pow').length;
  return score;
}

/** Each plan chord with the beat it first sounds at (events clamped to bar 1; evenly spaced without events). */
function cellsOf(plan: AnswerPlan, events: RhythmEvent[] | null): Cell[] {
  return plan.chords.map((c, i) => {
    const mine = events?.filter((ev) => ev.chord === i) ?? [];
    const beat = mine.length ? Math.min(...mine.map((ev) => ev.start)) : i * plan.beatsPerChord;
    return { name: c.name, beat: Math.max(0, beat) };
  });
}
