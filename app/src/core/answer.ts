import { chordName } from './chords';
import { estimateKey } from './key';
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
}

export type AnswerStatus = 'idle' | 'waiting-for-bar' | 'playing';

export interface AnswerEngineDeps {
  model: ChordModel;
  sink: () => NoteSink | null;
  settings: () => AnswerSettings;
  onPlan?: (plan: AnswerPlan | null, status: AnswerStatus) => void;
  /** defaults: performance.now and Math.random */
  now?: () => number;
  rng?: () => number;
  silenceMs?: number;
  minChords?: number;
  beatsPerChord?: number;
  velocity?: number;
}

/**
 * Frog answers: after the player pauses (all keys up for `silenceMs`) having played at least `minChords`
 * chords, sample a 2-4 chord continuation and play it, one chord per 2 beats. It starts on the next /bar
 * when Live's transport is running, otherwise right away. The player playing again cuts the answer off.
 */
export class AnswerEngine {
  private phrase: Chord[] = [];
  private history: ChordSymbol[] = [];
  private held = new Set<number>();
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private sounding: number[] = [];
  private pending: AnswerPlan | null = null;
  private lastBar = -Infinity;
  private status: AnswerStatus = 'idle';

  /** the last phrase the player played and the frog's answer to it, as timed notes (for Keep) */
  lastPhraseNotes: NoteEvent[] = [];
  lastAnswerNotes: NoteEvent[] = [];
  private phraseNotes: NoteEvent[] = [];

  private readonly now: () => number;
  private readonly rng: () => number;
  private readonly silenceMs: number;
  private readonly minChords: number;
  private readonly beatsPerChord: number;
  private readonly velocity: number;

  constructor(private readonly d: AnswerEngineDeps) {
    this.now = d.now ?? (() => performance.now());
    this.rng = d.rng ?? Math.random;
    this.silenceMs = d.silenceMs ?? 1500;
    this.minChords = d.minChords ?? 2;
    this.beatsPerChord = d.beatsPerChord ?? 2;
    this.velocity = d.velocity ?? 85;
  }

  /** every note the player plays */
  note(e: NoteEvent): void {
    this.phraseNotes.push(e);
    if (e.velocity > 0) {
      this.held.add(e.pitch);
      this.clearSilence();
      if (this.status !== 'idle') this.cancel(); // the player takes the lead again
    } else {
      this.held.delete(e.pitch);
      if (this.held.size === 0) this.armSilence();
    }
  }

  /** every chord the player plays (from the chord detector) */
  chord(c: Chord): void {
    this.phrase.push(c);
    this.history.push({ root: c.root, quality: c.quality });
    if (this.history.length > 32) this.history.shift();
  }

  /** a /bar from Frog Voice: Live's transport is running and a bar just started */
  bar(): void {
    this.lastBar = this.now();
    if (this.pending) {
      const plan = this.pending;
      this.pending = null;
      this.play(plan);
    }
  }

  /** release everything and forget any pending answer */
  cancel(): void {
    if (this.stepTimer) clearTimeout(this.stepTimer);
    this.stepTimer = null;
    this.pending = null;
    this.releaseSounding();
    this.setStatus('idle', null);
  }

  private beatMs(): number {
    return 60000 / (this.d.settings().bpm || 120);
  }

  /** Live's transport counts as running if a /bar arrived within the last bar and a half (4/4). */
  private transportRunning(): boolean {
    return this.now() - this.lastBar < 1.5 * 4 * this.beatMs();
  }

  private armSilence(): void {
    this.clearSilence();
    this.silenceTimer = setTimeout(() => this.onSilence(), this.silenceMs);
  }

  private clearSilence(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = null;
  }

  private onSilence(): void {
    this.silenceTimer = null;
    const s = this.d.settings();
    if (!s.answersOn || this.phrase.length < this.minChords || this.status !== 'idle') return;
    const plan = this.plan(s);
    this.lastPhraseNotes = this.phraseNotes;
    this.phraseNotes = [];
    this.phrase = [];
    if (this.transportRunning()) {
      this.pending = plan;
      this.setStatus('waiting-for-bar', plan);
    } else {
      this.play(plan);
    }
  }

  /** Sample 2-4 chords autoregressively (one per chord in the phrase, clamped), voiced in C3..C5. */
  plan(s: AnswerSettings): AnswerPlan {
    const length = Math.min(4, Math.max(2, this.phrase.length));
    const ctx = [...this.history];
    const key = estimateKey(ctx);
    const prior = priorFor(this.d.model, s.genre);
    const last = this.phrase[this.phrase.length - 1];
    let prevVoicing: number[] | null = last ? last.pitches : null;
    const chords: AnswerPlan['chords'] = [];
    for (let i = 0; i < length; i++) {
      const recent = ctx.slice(-CONTEXT_CHORDS);
      const prev = recent[recent.length - 1];
      const probs = this.d.model.predictNext(encode(recent), s.genre);
      const dist = reshape(probs, { weirdness: s.weirdness, prev, key, prior });
      const chord = decode(prev.root, sampleToken(dist, this.rng))!;
      const voicing = voiceChord(chord, prevVoicing);
      chords.push({ chord, name: chordName(chord.root, chord.quality), voicing });
      ctx.push(chord);
      prevVoicing = voicing;
    }
    return { chords, beatsPerChord: this.beatsPerChord };
  }

  private play(plan: AnswerPlan): void {
    this.setStatus('playing', plan);
    this.lastAnswerNotes = [];
    const step = (i: number) => {
      this.releaseSounding();
      if (i >= plan.chords.length) {
        this.stepTimer = null;
        this.setStatus('idle', plan);
        return;
      }
      for (const p of plan.chords[i].voicing) this.send(p, this.velocity);
      this.sounding = plan.chords[i].voicing;
      this.stepTimer = setTimeout(() => step(i + 1), plan.beatsPerChord * this.beatMs());
    };
    step(0);
  }

  private releaseSounding(): void {
    for (const p of this.sounding) this.send(p, 0);
    this.sounding = [];
  }

  private send(pitch: number, velocity: number): void {
    this.d.sink()?.send(pitch, velocity);
    this.lastAnswerNotes.push({ pitch, velocity, time: this.now() });
  }

  private setStatus(status: AnswerStatus, plan: AnswerPlan | null): void {
    this.status = status;
    this.d.onPlan?.(plan, status);
  }
}
