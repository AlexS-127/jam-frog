import { AnswerEngine } from './answer';
import { chordName, parseChordName } from './chords';
import type { ChordModel } from './model';
import type { AnswerPlan, Chord } from './types';
import { voiceChord } from './voicing';

// Listening test (feature 8): 5 fixed progressions x weirdness 0.1 and 0.9, each answered by every model.
// For each progression and weirdness the models are heard blind as "A" and "B" in a shuffled order.

export const PROGRESSIONS = ['C Am F G', 'Am F C G', 'D A Bm G', 'Em C G D', 'C E7 Am F'];
export const WEIRDNESS_LEVELS = [0.1, 0.9];

/** A small seeded PRNG (mulberry32), so every case plays the same answer each time. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The progression as played chords: close voicings around C3 with smooth voice leading. */
export function voiceProgression(progression: string): Chord[] {
  let prev: number[] | null = null;
  return progression.split(' ').map((name) => {
    const symbol = parseChordName(name);
    const pitches = voiceChord(symbol, prev, 55, 74);
    prev = pitches;
    return { ...symbol, name: chordName(symbol.root, symbol.quality), pitches };
  });
}

/** What the frog answers to `chords`, through the real AnswerEngine planning (candidates, scoring, voicing). */
export function answerFor(chords: Chord[], model: ChordModel, weirdness: number, seed: number, genre = 'all'): AnswerPlan {
  const settings = { answersOn: true, weirdness, genre, bpm: 120, phraseBars: 4 };
  const engine = new AnswerEngine({ model, sink: () => null, settings: () => settings, rng: seededRng(seed) });
  for (const c of chords) engine.chord(c);
  const plan = engine.makePlan(settings);
  engine.cancel(); // stop the phrase clock and background planning the chords started
  return plan;
}

export interface ListeningCase {
  id: string;
  progression: string;
  call: Chord[];
  weirdness: number;
  /** the blind options, in the order they are presented: A, B (, C...) */
  options: { model: string; plan: AnswerPlan }[];
}

/** Every progression x weirdness, with each model's answer in a seeded shuffled order. */
export function buildCases(models: Record<string, ChordModel>, seed = 1): ListeningCase[] {
  const shuffle = seededRng(seed);
  const cases: ListeningCase[] = [];
  PROGRESSIONS.forEach((progression, p) => {
    const call = voiceProgression(progression);
    for (const weirdness of WEIRDNESS_LEVELS) {
      const caseSeed = seed * 1000 + p * 10 + Math.round(weirdness * 10);
      const options = Object.entries(models).map(([name, m]) => ({ model: name, plan: answerFor(call, m, weirdness, caseSeed) }));
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(shuffle() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      cases.push({ id: `${p}-${weirdness}`, progression, call, weirdness, options });
    }
  });
  return cases;
}

export type Vote = number | 'tie'; // index into options, or a tie

/** Wins per model, overall and per weirdness level. */
export function tally(cases: ListeningCase[], votes: Map<string, Vote>) {
  const models = [...new Set(cases.flatMap((c) => c.options.map((o) => o.model)))];
  const empty = () => Object.fromEntries([...models, 'tie'].map((m) => [m, 0])) as Record<string, number>;
  const overall = empty();
  const byWeirdness: Record<string, Record<string, number>> = {};
  for (const c of cases) {
    const v = votes.get(c.id);
    if (v === undefined) continue;
    const winner = v === 'tie' ? 'tie' : c.options[v].model;
    overall[winner]++;
    (byWeirdness[c.weirdness] ??= empty())[winner]++;
  }
  return { overall, byWeirdness, voted: [...votes.keys()].filter((k) => cases.some((c) => c.id === k)).length, total: cases.length };
}
