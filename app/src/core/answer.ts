import { chordName } from './chords';
import { estimateKey, type Key } from './key';
import type { ChordModel } from './model';
import { reshape, sampleToken } from './sampler';
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
  /** play the answer in the rhythm (and dynamics) of the player's phrase instead of one chord per bar */
  rhythm?: boolean;
}

export type AnswerStatus = 'idle' | 'listening' | 'playing';

export interface AnswerProgress {
  status: AnswerStatus;
  /** 1-based bar within the phrase or the answer; 0 when idle */
  bar: number;
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
  const sorted = [...strikes].filter((s) => s.beats < totalBeats).sort((a, b) => a.beats - b.beats);
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

interface PlanJob {
  forKey: string;
  s: AnswerSettings;
  length: number;
  key: Key;
  prior: Float32Array;
  history: ChordSymbol[];
  phrase: Chord[];
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
  private chordStarts: number[] = [];
  private sounding = new Set<number>();
  /** every strike of the current phrase (re-strikes too), for rhythm and dynamics */
  private strikes: Strike[] = [];
  /** when bar 1 of the current phrase starts (ms) */
  private phraseStartTime = 0;
  /** the answer's strikes, mapped from the player's, while it plays in rhythm mode */
  private rhythm: RhythmEvent[] = [];
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
    if (!last || last.root !== c.root || last.quality !== c.quality) {
      this.history.push({ root: c.root, quality: c.quality });
      if (this.history.length > SESSION_CHORDS) {
        this.history.shift();
        this.phraseStarts = this.phraseStarts.map((i) => i - 1).filter((i) => i >= 0);
      }
    }

    if (this.status === 'playing') {
      // A chord in the answer's first beat is the tail of the player's phrase; later, the player takes over.
      if (this.now() - this.lastBarAt < this.beatMs() && this.barIndex === this.answerStart) return;
      this.stopAnswer();
    }
    if (this.status === 'idle') this.startPhrase();
    const prev = this.phrase[this.phrase.length - 1];
    const change = !prev || prev.root !== c.root || prev.quality !== c.quality;
    if (change) this.phrase.push(c);
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
      beats: Math.max(0, (onset - this.phraseStartTime) / this.beatLen()),
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
    this.phrase = [];
    this.strikes = [];
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
    this.status = 'listening';
  }

  private onBar(): void {
    const s = this.d.settings();
    if (this.status === 'listening' && this.barIndex >= this.phraseStart + s.phraseBars) {
      if (s.answersOn && this.phrase.length >= this.minChords) this.startAnswer(s);
      else this.cancel();
      return;
    }
    if (this.status === 'playing') {
      const bar = this.barIndex - this.answerStart;
      if (bar >= s.phraseBars) {
        this.stopAnswer();
        this.cancel();
        return;
      }
      if (this.rhythm.length) this.playRhythmBar(bar);
      else {
        const i = this.chordStarts.indexOf(bar);
        if (i >= 0) this.playChord(i);
      }
    }
    this.emit();
  }

  // ---- answering ----

  private startAnswer(s: AnswerSettings): void {
    // The plan made in the background, or the best candidate so far if planning is still running,
    // or (if neither exists) a quick plan now.
    const key = this.phraseKey();
    let plan: AnswerPlan;
    if (this.planFor === key && this.plan) plan = this.plan;
    else if (this.job && this.job.forKey === key && this.job.cands.length) plan = this.finishJob(this.job);
    else plan = this.makePlan(s, QUICK_PLAN_MS);
    this.cancelPlanning();
    this.phraseNotes = [];
    this.plan = plan;
    this.status = 'playing';
    this.answerStart = this.barIndex;
    const n = plan.chords.length;
    this.chordStarts = plan.chords.map((_, i) => Math.floor((i * s.phraseBars) / n));
    this.dynamics = this.strikes.length ? this.strikes.reduce((a, st) => a + st.velocity, 0) / this.strikes.length : this.velocity;
    this.rhythm = s.rhythm ? mirrorRhythm(this.strikes, this.phrase.length, n, s.phraseBars * BEATS_PER_BAR) : [];
    if (this.rhythm.length) this.playRhythmBar(0);
    else this.playChord(0);
    this.emit();
  }

  /** Average velocity of the player's phrase: the answer follows their dynamics. */
  private dynamics = 85;

  /** Schedule the answer strikes that fall in this bar, timed from this bar line (so they never drift). */
  private playRhythmBar(bar: number): void {
    const plan = this.plan;
    if (!plan) return;
    const beat = this.beatLen();
    for (const ev of this.rhythm) {
      if (Math.floor(ev.start / BEATS_PER_BAR) !== bar) continue;
      const voicing = plan.chords[ev.chord].voicing;
      const at = (ev.start - bar * BEATS_PER_BAR) * beat;
      const play = () => {
        for (const p of voicing) if (this.sounding.has(p)) this.send(p, 0);
        voicing.forEach((p, i) => this.send(p, this.humanize(ev.velocity, i, voicing.length)));
        this.noteTimers.push(setTimeout(() => {
          for (const p of voicing) this.send(p, 0);
        }, (ev.end - ev.start) * beat));
      };
      // On the bar line itself: play now, in the bar tick (a 0 ms timer still fires a little late).
      if (at < 1) play();
      else this.noteTimers.push(setTimeout(play, at));
    }
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
    this.noteTimers.forEach(clearTimeout);
    this.noteTimers = [];
    this.rhythm = [];
    for (const p of [...this.sounding]) this.send(p, 0);
    if (this.status === 'playing') this.status = 'idle';
  }

  private playChord(i: number): void {
    const plan = this.plan;
    if (!plan) return;
    for (const p of [...this.sounding]) this.send(p, 0);
    const voicing = plan.chords[i].voicing;
    voicing.forEach((p, j) => this.send(p, this.humanize(this.dynamics + (i === 0 ? 6 : 0), j, voicing.length)));
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

  private newJob(s: AnswerSettings): PlanJob {
    return {
      forKey: this.phraseKey(),
      s,
      // one answer chord per chord change; up to 8 when mirroring the rhythm (so every change has a partner)
      length: Math.min(s.rhythm ? 8 : 4, Math.max(2, this.phrase.length)),
      key: this.key(),
      prior: priorFor(this.d.model, s.genre),
      history: [...this.history],
      phrase: [...this.phrase],
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
      job.cands.push({ chords, score: scoreAnswer(chords, logp / job.length, job.phrase, job.key) });
    }
    job.spent += this.now() - t0;
  }

  /** Low weirdness takes the top score; higher weirdness picks among good candidates in proportion to score. */
  private finishJob(job: PlanJob): AnswerPlan {
    const s = job.s;
    const cands = [...job.cands].sort((a, b) => b.score - a.score);
    let pick = cands[0];
    if (s.weirdness > 0.3 && cands.length > 1) {
      const temp = 0.2 + 1.5 * s.weirdness;
      const top = cands.slice(0, 12);
      const weights = top.map((c) => Math.exp((c.score - top[0].score) / temp));
      let r = this.rng() * weights.reduce((a, b) => a + b, 0);
      pick = top.find((_, i) => (r -= weights[i]) <= 0) ?? top[0];
    }
    // Play where the player played: their phrase's register (and bass line, if they had one).
    const reg = registerOf(job.phrase.map((c) => c.pitches)) ?? { lo: 60, hi: 84, bass: null };
    let prevVoicing: number[] | null = job.phrase.at(-1)?.pitches ?? null;
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
    this.d.onPlan?.(this.plan, { status: this.status, bar, bars: s.phraseBars });
  }
}

/**
 * How good an answer sounds, on top of how likely the model finds it (mean log-probability):
 * ending on the tonic is a full cadence, ending on V a half cadence; bouncing back and forth
 * (A B A) and repeating the player's own phrase chord for chord count against it.
 */
export function scoreAnswer(chords: ChordSymbol[], meanLogp: number, phrase: ChordSymbol[], key: Key): number {
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
  return score;
}
