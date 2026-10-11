import { AnswerEngine } from '../core/answer';
import { chordName, QUALITY_INTERVALS } from '../core/chords';
import type { ChordModel } from '../core/model';
import type { AnswerPlan, Chord, Quality } from '../core/types';

export const WEIRDNESS_LEVELS = [0.1, 0.9] as const;
export type WeirdnessLevel = (typeof WEIRDNESS_LEVELS)[number];
export type ModelId = 'ngram' | 'gru';
export type Vote = 'a' | 'b' | 'tie';

export interface Progression {
  id: string;
  name: string;
  chords: Chord[];
}

export interface ListeningPair {
  id: string;
  progression: Progression;
  weirdness: WeirdnessLevel;
  aModel: ModelId;
  bModel: ModelId;
}

export interface PlaybackChord {
  notes: number[];
  beats: number;
  name: string;
  phase: 'context' | 'answer';
}

export interface ModelVoteSummary {
  ngram: { low: number; high: number; wins: number };
  gru: { low: number; high: number; wins: number };
  ties: number;
}

const chord = (root: number, quality: Quality): Chord => {
  const rootMidi = 60 + root;
  return {
    root,
    quality,
    name: chordName(root, quality),
    pitches: QUALITY_INTERVALS[quality].map((interval) => rootMidi + interval),
  };
};

/** Fixed contexts from the Lane E listening-test brief. */
export const PROGRESSIONS: Progression[] = [
  { id: 'c-am-f-g', name: 'C · Am · F · G', chords: [chord(0, 'maj'), chord(9, 'min'), chord(5, 'maj'), chord(7, 'maj')] },
  { id: 'am-f-c-g', name: 'Am · F · C · G', chords: [chord(9, 'min'), chord(5, 'maj'), chord(0, 'maj'), chord(7, 'maj')] },
  { id: 'd-a-bm-g', name: 'D · A · Bm · G', chords: [chord(2, 'maj'), chord(9, 'maj'), chord(11, 'min'), chord(7, 'maj')] },
  { id: 'em-c-g-d', name: 'Em · C · G · D', chords: [chord(4, 'min'), chord(0, 'maj'), chord(7, 'maj'), chord(2, 'maj')] },
  { id: 'c-e7-am-f', name: 'C · E7 · Am · F', chords: [chord(0, 'maj'), chord(4, 'dom7'), chord(9, 'min'), chord(5, 'maj')] },
];

export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Build a shuffled, blind A/B list. The same seed also makes model assignment testable. */
export function buildListeningPairs(seed: number): ListeningPair[] {
  const sessionRandom = makeRandom(seed);
  const pairs = PROGRESSIONS.flatMap((progression) => WEIRDNESS_LEVELS.map((weirdness) => {
    const random = makeRandom(hash(`${seed}:${progression.id}:${weirdness}`));
    const aModel: ModelId = random() < 0.5 ? 'ngram' : 'gru';
    return {
      id: `${progression.id}:${weirdness}`,
      progression,
      weirdness,
      aModel,
      bModel: aModel === 'ngram' ? 'gru' : 'ngram',
    } satisfies ListeningPair;
  }));
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(sessionRandom() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  return pairs;
}

/** Yield before each plan, then evaluate all 48 candidates for reproducible comparisons. */
export function generateAnswer(
  model: ChordModel,
  progression: Progression,
  weirdness: WeirdnessLevel,
  seed: number,
): Promise<AnswerPlan> {
  return new Promise((resolve, reject) => setTimeout(() => {
    const settings = { answersOn: true, weirdness, genre: 'all', bpm: 120, phraseBars: 4 as const };
    const engine = new AnswerEngine({
      model,
      sink: () => null,
      settings: () => settings,
      rng: makeRandom(seed),
    });
    try {
      for (const inputChord of progression.chords) engine.chord(inputChord);
      // The live engine's wall-clock budget otherwise makes cold and warm runs differ.
      resolve(engine.makePlan(settings, Infinity));
    } catch (error) {
      reject(error);
    } finally {
      engine.cancel();
    }
  }, 0));
}

export function stimulusSeed(pairId: string): number {
  return hash(`jam-frog-listening-v1:${pairId}`);
}

export function buildPlaybackSequence(pair: ListeningPair, plan: AnswerPlan): PlaybackChord[] {
  return [
    ...pair.progression.chords.map((inputChord) => ({ notes: inputChord.pitches, beats: 4, name: inputChord.name, phase: 'context' as const })),
    ...plan.chords.map((answerChord) => ({ notes: answerChord.voicing, beats: plan.beatsPerChord, name: answerChord.name, phase: 'answer' as const })),
  ];
}

export function summarizeVotes(pairs: ListeningPair[], votes: ReadonlyMap<string, Vote>): ModelVoteSummary {
  const summary: ModelVoteSummary = {
    ngram: { low: 0, high: 0, wins: 0 },
    gru: { low: 0, high: 0, wins: 0 },
    ties: 0,
  };
  for (const pair of pairs) {
    const vote = votes.get(pair.id);
    if (!vote || vote === 'tie') {
      if (vote === 'tie') summary.ties++;
      continue;
    }
    const winner = vote === 'a' ? pair.aModel : pair.bModel;
    const level = pair.weirdness < 0.5 ? 'low' : 'high';
    summary[winner][level]++;
    summary[winner].wins++;
  }
  return summary;
}
