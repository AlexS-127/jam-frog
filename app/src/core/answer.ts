import { chordName } from './chords';
import { estimateKey, type Key } from './key';
import type { ChordModel } from './model';
import { reshape, sampleToken } from './sampler';
import { CONTEXT_CHORDS, priorFor } from './suggest';
import type { AnswerPlan, Chord, ChordSymbol, NoteEvent, NoteSink } from './types';
import { decode, encode } from './vocab';
import { voiceChord } from './voicing';

export interface AnswerSettings {
  answersOn: boolean;
  weirdness: number;
  genre: string;
  /** the UI's BPM (follows Live's /tempo when the Max for Live bridge is used) */
  bpm: number;
  /** how long the player's phrase is; the frog's answer is just as long */
  phraseBars: number;
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
  private history: ChordSymbol[] = [];
  private phrase: Chord[] = [];
  private status: AnswerStatus = 'idle';
  /** bars counted since the clock started; the phrase and the answer are positioned on this count */
  private barIndex = 0;
  private lastBarAt = -Infinity;
  /** whether the last bar line came from Live (true) or from the engine's own clock (false) */
  private lastBarLive = false;
  private phraseStart = 0;
  private answerStart = 0;
  private plan: AnswerPlan | null = null;
  private planFor = '';
  private chordStarts: number[] = [];
  private sounding: number[] = [];
  private clock: ReturnType<typeof setTimeout> | null = null;
  private planTimer: ReturnType<typeof setTimeout> | null = null;

  /** the last phrase the player played and the frog's answer to it, as timed notes (for Keep) */
  lastPhraseNotes: NoteEvent[] = [];
  lastAnswerNotes: NoteEvent[] = [];
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
  }

  /** every chord the player plays (from the chord detector) */
  chord(c: Chord): void {
    this.history.push({ root: c.root, quality: c.quality });
    if (this.history.length > 32) this.history.shift();

    if (this.status === 'playing') {
      // A chord in the answer's first beat is the tail of the player's phrase; later, the player takes over.
      if (this.now() - this.lastBarAt < this.beatMs() && this.barIndex === this.answerStart) return;
      this.stopAnswer();
    }
    if (this.status === 'idle') this.startPhrase();
    this.phrase.push(c);
    this.schedulePlan();
    this.emit();
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

  private barMs(): number {
    return BEATS_PER_BAR * this.beatMs();
  }

  private transportRunning(): boolean {
    return this.now() - this.lastBarAt < 1.5 * this.barMs();
  }

  /** One bar line. From Live (`live`) or from the engine's own clock when Live's transport is stopped. */
  private tick(live: boolean): void {
    if (live || this.status !== 'idle') {
      this.barIndex++;
      this.lastBarAt = this.now();
      this.lastBarLive = live;
    }
    // Keep a fallback tick running while busy: Live's next /bar normally arrives first and re-arms it.
    this.stopClock();
    if (this.status !== 'idle') {
      this.clock = setTimeout(() => this.tick(false), this.barMs() * (live ? 1.1 : 1));
    }
    this.onBar();
  }

  private stopClock(): void {
    if (this.clock) clearTimeout(this.clock);
    this.clock = null;
  }

  private startPhrase(): void {
    this.phrase = [];
    // Notes from just before this chord belong to it (the chord detector waits ~60 ms); older ones don't.
    const t = this.now();
    this.phraseNotes = this.phraseNotes.filter((n) => n.time >= t - 150);
    const intoBar = t - this.lastBarAt;
    if (intoBar < 1.5 * this.barMs()) {
      // A bar grid is running (Live's, or ours from the last phrase): stay on it. A chord in the last
      // quarter of a bar is an anticipation of the next bar.
      this.phraseStart = intoBar > 0.75 * this.barMs() ? this.barIndex + 1 : this.barIndex;
      if (!this.clock) {
        const untilNext = Math.max(0, this.barMs() - (intoBar % this.barMs()));
        this.clock = setTimeout(() => this.tick(false), this.lastBarLive ? untilNext + 0.1 * this.barMs() : untilNext);
      }
    } else {
      // No grid: bar 1 of the phrase starts with this chord.
      this.barIndex = 0;
      this.lastBarAt = t;
      this.lastBarLive = false;
      this.phraseStart = 0;
      this.stopClock();
      this.clock = setTimeout(() => this.tick(false), this.barMs());
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
      const i = this.chordStarts.indexOf(this.barIndex - this.answerStart);
      if (this.barIndex - this.answerStart >= s.phraseBars) {
        this.stopAnswer();
        this.cancel();
        return;
      }
      if (i >= 0) this.playChord(i);
    }
    this.emit();
  }

  // ---- answering ----

  private startAnswer(s: AnswerSettings): void {
    const key = this.phraseKey();
    const plan = this.planFor === key && this.plan ? this.plan : this.makePlan(s);
    this.lastPhraseNotes = this.phraseNotes;
    this.phraseNotes = [];
    this.lastAnswerNotes = [];
    this.plan = plan;
    this.status = 'playing';
    this.answerStart = this.barIndex;
    const n = plan.chords.length;
    this.chordStarts = plan.chords.map((_, i) => Math.floor((i * s.phraseBars) / n));
    this.playChord(0);
    this.emit();
  }

  private stopAnswer(): void {
    if (this.planTimer) clearTimeout(this.planTimer);
    this.planTimer = null;
    for (const p of this.sounding) this.send(p, 0);
    this.sounding = [];
    if (this.status === 'playing') this.status = 'idle';
  }

  private playChord(i: number): void {
    const plan = this.plan;
    if (!plan) return;
    for (const p of this.sounding) this.send(p, 0);
    this.sounding = plan.chords[i].voicing;
    for (const p of this.sounding) this.send(p, this.velocity);
  }

  private send(pitch: number, velocity: number): void {
    this.d.sink()?.send(pitch, velocity);
    this.lastAnswerNotes.push({ pitch, velocity, time: this.now() });
  }

  private phraseKey(): string {
    const s = this.d.settings();
    return `${this.phrase.map((c) => c.name).join(' ')}|${s.weirdness}|${s.genre}|${s.phraseBars}`;
  }

  /** Plan in the background after each chord, so the answer is ready the moment the phrase ends. */
  private schedulePlan(): void {
    if (this.planTimer) clearTimeout(this.planTimer);
    this.planTimer = setTimeout(() => {
      this.planTimer = null;
      if (this.status !== 'listening' || this.phrase.length < this.minChords) return;
      this.plan = this.makePlan(this.d.settings());
      this.planFor = this.phraseKey();
      this.emit();
    }, 0);
  }

  /**
   * Generate candidate continuations with the weirdness sampler and keep the best by `scoreAnswer`.
   * Low weirdness takes the top score; higher weirdness picks among good candidates in proportion to score.
   */
  makePlan(s: AnswerSettings): AnswerPlan {
    const length = Math.min(4, Math.max(2, this.phrase.length));
    const key = estimateKey(this.history);
    const prior = priorFor(this.d.model, s.genre);
    const cands: { chords: ChordSymbol[]; score: number }[] = [];
    const seen = new Set<string>();
    for (let k = 0; k < this.candidates; k++) {
      const ctx = [...this.history];
      const chords: ChordSymbol[] = [];
      let logp = 0;
      for (let i = 0; i < length; i++) {
        const recent = ctx.slice(-CONTEXT_CHORDS);
        const prev = recent[recent.length - 1];
        const probs = this.d.model.predictNext(encode(recent), s.genre);
        const dist = reshape(probs, { weirdness: s.weirdness, prev, key, prior });
        const t = sampleToken(dist, this.rng);
        logp += Math.log(probs[t] || 1e-9);
        const chord = decode(prev.root, t)!;
        chords.push(chord);
        ctx.push(chord);
      }
      const id = chords.map((c) => `${c.root}${c.quality}`).join(' ');
      if (seen.has(id)) continue;
      seen.add(id);
      cands.push({ chords, score: scoreAnswer(chords, logp / length, this.phrase, key) });
    }
    cands.sort((a, b) => b.score - a.score);
    let pick = cands[0];
    if (s.weirdness > 0.3 && cands.length > 1) {
      const temp = 0.2 + 1.5 * s.weirdness;
      const top = cands.slice(0, 12);
      const weights = top.map((c) => Math.exp((c.score - top[0].score) / temp));
      let r = this.rng() * weights.reduce((a, b) => a + b, 0);
      pick = top.find((_, i) => (r -= weights[i]) <= 0) ?? top[0];
    }
    let prevVoicing: number[] | null = this.phrase.at(-1)?.pitches ?? null;
    const chords = pick.chords.map((chord) => {
      const voicing = voiceChord(chord, prevVoicing);
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
