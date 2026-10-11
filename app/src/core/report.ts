import type { JamLog, LogChord } from './answer';
import { chordName, parseChordName } from './chords';
import { isBorrowed, isDiatonic, keyName, type Key } from './key';
import type { ChordSymbol } from './types';

// The jam report: after Stop, the jam's chords are analysed here (Roman numerals, borrowed chords,
// substitutions, cadences, well-known progressions, key changes). The result is a short local report, and
// the facts Gemini gets to write a livelier one from (see geminiRequest; the call itself is in the main process).

export interface Moment {
  type: string;
  bar: number;
  who: 'you' | 'frog';
  chords: string[];
  numerals: string[];
  title: string;
  text: string;
  weight: number;
}

export interface JamReport {
  /** what the frog says in its speech bubble (one or two sentences) */
  summary: string;
  moments: { bar: number; title: string; text: string }[];
  trivia: string[];
  /** "24 bars · C major → E major · 31 chords" */
  meta: string;
  source: 'gemini' | 'local';
}

export interface JamAnalysis {
  log: JamLog;
  moments: Moment[];
  /** the progression block by block, in numerals */
  blocks: { bars: string; who: 'you' | 'frog'; chords: string[]; numerals: string[] }[];
  stats: { bars: number; chords: number; yours: number; frogs: number; distinct: number; colour: number; favourite: string | null };
}

const MAX_MOMENTS = 6;
const mod12 = (n: number) => ((n % 12) + 12) % 12;
const DEGREES = ['I', '♭II', 'II', '♭III', 'III', 'IV', '♭V', 'V', '♭VI', 'VI', '♭VII', 'VII'];
const SUFFIX: Record<ChordSymbol['quality'], string> = { maj: '', min: '', dim: '°', aug: '+', sus: 'sus', dom7: '7', maj7: 'maj7', min7: '7', pow: '5' };
const LOWER = new Set(['min', 'min7', 'dim']);

/** The chord as a Roman numeral in the key: I, vi, ♭VII, V7, ii7, vii°, ♭VI (accidentals from the major scale). */
export function numeral(c: ChordSymbol, key: Key): string {
  const degree = DEGREES[mod12(c.root - key.tonic)];
  return (LOWER.has(c.quality) ? degree.toLowerCase() : degree) + SUFFIX[c.quality];
}

/** The numeral without 7ths, sus or 5: what progressions are matched on. */
const plain = (c: ChordSymbol, key: Key) =>
  numeral({ root: c.root, quality: LOWER.has(c.quality) ? (c.quality === 'dim' ? 'dim' : 'min') : 'maj' }, key);

/** A major or dominant chord whose root is a fifth above a chord of the key, other than the key's own V. */
function secondaryTarget(c: ChordSymbol, key: Key): ChordSymbol | null {
  if (c.quality !== 'maj' && c.quality !== 'dom7') return null;
  const iv = mod12(c.root - key.tonic);
  if (iv === 7) return null; // the real V
  if (isDiatonic(c, key) && !(c.quality === 'dom7' && iv === 0 && !key.minor)) return null; // I7 in major is V7/IV
  const root = mod12(c.root + 5);
  for (const quality of ['maj', 'min'] as const) if (isDiatonic({ root, quality }, key)) return { root, quality };
  return null;
}

/** A chord name ("Am7") as its Roman numeral in the key ("vi7"); a name it can't read stays as it is. */
export function romanName(name: string, key: Key): string {
  try {
    return label(parseChordName(name), key);
  } catch {
    return name;
  }
}

/** The chord's name in the analysis: its numeral, or V/x for a secondary dominant ("V7/ii"). */
export function label(c: ChordSymbol, key: Key): string {
  const target = secondaryTarget(c, key);
  return target ? `V${c.quality === 'dom7' ? '7' : ''}/${plain(target, key)}` : numeral(c, key);
}

const FUNCTION: Record<string, 'T' | 'S' | 'D'> = {
  I: 'T', vi: 'T', iii: 'T', IV: 'S', ii: 'S', iv: 'S', '♭VI': 'S', V: 'D', 'vii°': 'D', '♭II': 'D',
  i: 'T', '♭III': 'T', 'ii°': 'S',
};
const FUNCTION_NAME = { T: 'home (tonic)', S: 'away (subdominant)', D: 'tension (dominant)' };

/** Well-known progressions, matched on plain numerals. */
const PATTERNS: { name: string; numerals: string[]; text: string }[] = [
  { name: 'The "four chords" progression', numerals: ['I', 'V', 'vi', 'IV'], text: 'I–V–vi–IV, the four chords behind hundreds of pop hits.' },
  { name: 'The "four chords" progression', numerals: ['vi', 'IV', 'I', 'V'], text: 'vi–IV–I–V, the moodier rotation of pop’s four chords.' },
  { name: 'The ’50s progression', numerals: ['I', 'vi', 'IV', 'V'], text: 'I–vi–IV–V, the doo-wop progression of “Stand by Me” and countless ’50s ballads.' },
  { name: 'The Andalusian cadence', numerals: ['i', '♭VII', '♭VI', 'V'], text: 'i–♭VII–♭VI–V, a descending line straight out of flamenco.' },
  { name: 'The royal road', numerals: ['IV', 'V', 'iii', 'vi'], text: 'IV–V–iii–vi, the “royal road” progression all over J-pop and anime themes.' },
  { name: 'Pachelbel’s Canon', numerals: ['I', 'V', 'vi', 'iii'], text: 'I–V–vi–iii, the opening of Pachelbel’s Canon in D.' },
  { name: 'Mixolydian rock', numerals: ['I', '♭VII', 'IV'], text: 'I–♭VII–IV, the classic-rock move of “Sweet Home Alabama” and “Hey Jude”’s coda.' },
  { name: 'The Mario cadence', numerals: ['♭VI', '♭VII', 'I'], text: '♭VI–♭VII–I, the fanfare when Mario reaches the flagpole.' },
  { name: 'A ii–V–I', numerals: ['ii', 'V', 'I'], text: 'ii–V–I, the backbone of jazz harmony.' },
];

/** Trivia the local report can add, by moment type. */
const TRIVIA: Record<string, string> = {
  tritone: 'Tritone subs work because a dominant 7th and the 7th chord a tritone away share the same two tension notes.',
  borrowed: 'Borrowing chords from the parallel minor is called modal mixture; the Beatles did it constantly.',
  minorPlagal: 'The minor iv to I is the bittersweet sound of Radiohead’s “Creep” and many Beatles endings.',
  deceptive: 'Composers have used the deceptive cadence since the Baroque to keep a piece from ending too soon.',
  keyChange: 'A late key change up a step is nicknamed the “truck driver’s gear change”.',
  secondary: 'Secondary dominants briefly treat another chord as home: the V7/V is called the “double dominant”.',
  substitution: 'Chords with the same function can stand in for each other: vi for I, ii for IV, vii° for V.',
  'The "four chords" progression': 'The Axis of Awesome sang 40 hits over the same four chords in their “4 Chords” medley.',
  'The Mario cadence': 'The ♭VI–♭VII–I fanfare is also called the Aeolian cadence.',
  'The Andalusian cadence': 'The Andalusian cadence goes back to the Renaissance and drives “Hit the Road Jack”.',
  'Pachelbel’s Canon': 'Pachelbel’s Canon was almost forgotten until a 1968 recording made it a wedding staple.',
  'A ii–V–I': 'Jazz musicians practise ii–V–Is in all 12 keys; it is the most common progression in jazz standards.',
};

function keyRelation(from: Key, to: Key): string {
  const up = mod12(to.tonic - from.tonic);
  if (up === 0) return `to the parallel ${to.minor ? 'minor' : 'major'}, same home note with a new mood`;
  if ((!from.minor && to.minor && up === 9) || (from.minor && !to.minor && up === 3)) return `to the relative ${to.minor ? 'minor' : 'major'}: the same notes, a new home`;
  if (up === 7) return 'up a fifth to the dominant key, the most common modulation there is';
  if (up === 5) return 'to the subdominant key, a relaxed, homeward move';
  if (up === 1 || up === 2) return `up a ${up === 1 ? 'half' : 'whole'} step, the “truck driver’s gear change” that lifts a last chorus`;
  if ([3, 4, 8, 9].includes(up)) return 'a chromatic-mediant shift, the cinematic move film composers love';
  return 'a bold jump to a distant key';
}

/** Analyse a jam: its progression by block, notable moments (most interesting first), and stats. */
export function analyseJam(log: JamLog): JamAnalysis {
  const keyAt = (bar: number) => log.keyChanges.filter((k) => k.bar <= bar).reduce<Key>((_, k) => k.to, log.startKey);
  const sorted = [...log.chords].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  // The progression: your opening phrase and the frog's blocks (repeats collapsed); you, playing along, separately.
  const progression: LogChord[] = [];
  for (const c of sorted) {
    if (c.who === 'you' && c.bar > log.phraseBars) continue;
    const last = progression[progression.length - 1];
    if (last && last.chord.root === c.chord.root && last.chord.quality === c.chord.quality) continue;
    progression.push(c);
  }
  const alongside = sorted.filter((c) => c.who === 'you' && c.bar > log.phraseBars);

  const moments: Moment[] = [];
  const add = (m: Omit<Moment, 'chords' | 'numerals'> & { at: LogChord[] }) => {
    const key = keyAt(m.at[0].bar);
    const { at, ...rest } = m;
    moments.push({ ...rest, chords: at.map((c) => c.name), numerals: at.map((c) => label(c.chord, key)) });
  };

  for (const k of log.keyChanges) {
    const at = sorted.find((c) => c.bar >= k.bar) ?? sorted[sorted.length - 1];
    add({ type: 'keyChange', bar: k.bar, who: 'you', at: [at], weight: 6,
      title: `Key change: ${keyName(k.from)} → ${keyName(k.to)}`, text: `You moved ${keyRelation(k.from, k.to)}, and the frog followed.` });
  }

  const lines: LogChord[][] = [progression, alongside];
  for (const line of lines) {
    line.forEach((c, i) => {
      const key = keyAt(c.bar);
      const next = line[i + 1];
      const num = (x: LogChord) => numeral(x.chord, keyAt(x.bar));
      if (next && c.chord.quality === 'dom7' && mod12(c.chord.root - next.chord.root) === 1) {
        const v7 = chordName(mod12(next.chord.root + 7), 'dom7');
        add({ type: 'tritone', bar: c.bar, who: c.who, at: [c, next], weight: 5, title: 'Tritone substitution',
          text: `${c.name} (${num(c)}) stands in for ${v7}, the usual V7 of ${next.name}: they share a tritone, so it slides down a half step instead.` });
        return;
      }
      const target = secondaryTarget(c.chord, key);
      if (target && next && next.chord.root === target.root) {
        add({ type: 'secondary', bar: c.bar, who: c.who, at: [c, next], weight: 4, title: `Secondary dominant (${label(c.chord, key)})`,
          text: `${c.name} acts as the V of ${next.name} (${num(next)}), making ${next.name} feel like home for a moment.` });
      } else if (isBorrowed(c.chord, key)) {
        const minorIv = !key.minor && mod12(c.chord.root - key.tonic) === 5 && LOWER.has(c.chord.quality);
        if (minorIv && next && next.chord.root === key.tonic) {
          add({ type: 'minorPlagal', bar: c.bar, who: c.who, at: [c, next], weight: 4, title: 'Minor plagal cadence (iv–I)',
            text: `${c.name} (iv), borrowed from ${keyName({ ...key, minor: true })}, melts into ${next.name}: bittersweet.` });
        } else {
          add({ type: 'borrowed', bar: c.bar, who: c.who, at: [c], weight: 3, title: `Borrowed chord: ${num(c)}`,
            text: `${c.name} (${num(c)}) is borrowed from ${keyName({ ...key, minor: !key.minor })}: modal mixture for a darker colour.` });
        }
      }
      if (next && plain(c.chord, key) === 'V' && (plain(next.chord, key) === 'vi' || plain(next.chord, key) === '♭VI')) {
        add({ type: 'deceptive', bar: next.bar, who: next.who, at: [c, next], weight: 4, title: 'Deceptive cadence',
          text: `${c.name} (V) sets up the home chord, but ${next.name} (${num(next)}) arrives instead.` });
      }
    });
    // well-known progressions (first time each is heard)
    for (const p of PATTERNS) {
      for (let i = 0; i + p.numerals.length <= line.length; i++) {
        const win = line.slice(i, i + p.numerals.length);
        const key = keyAt(win[0].bar);
        if (!win.every((c, j) => plain(c.chord, key) === p.numerals[j])) continue;
        add({ type: p.name, bar: win[0].bar, who: win[0].who, at: win, weight: p.numerals.length === 4 ? 4.5 : 3.5, title: p.name, text: p.text });
        break;
      }
    }
  }

  // Substitutions: a block that repeats the one before it, with chords swapped for others of the same function.
  const blocks = blocksOf(log, progression);
  for (let b = 1; b < blocks.length; b++) {
    const [prev, cur] = [blocks[b - 1], blocks[b]];
    if (prev.items.length !== cur.items.length) continue;
    const plains = (x: typeof prev) => x.items.map((c) => plain(c.chord, keyAt(c.bar)));
    const [p, q] = [plains(prev), plains(cur)];
    const diffs = q.map((n, i) => (n !== p[i] ? i : -1)).filter((i) => i >= 0);
    if (diffs.length === 0 || diffs.length > 2 || q.length - diffs.length < 2) continue;
    const i = diffs[0];
    const f = FUNCTION[q[i]];
    if (!f || f !== FUNCTION[p[i]]) continue;
    add({ type: 'substitution', bar: cur.items[i].bar, who: cur.items[i].who, at: [cur.items[i]], weight: 3.5,
      title: `Substitution: ${q[i]} for ${p[i]}`,
      text: `The progression came back with ${cur.items[i].name} (${q[i]}) where ${prev.items[i].name} (${p[i]}) was: both do the ${FUNCTION_NAME[f]} job.` });
  }

  // The most interesting, at most 2 of a kind, then in the order they happened.
  const seen = new Map<string, number>();
  const picked = [...moments]
    .sort((a, b) => b.weight - a.weight || a.bar - b.bar)
    .filter((m) => {
      const n = seen.get(m.type) ?? 0;
      seen.set(m.type, n + 1);
      return n < (m.type === m.title ? 1 : 2); // a named progression once, other kinds up to twice
    })
    .slice(0, MAX_MOMENTS)
    .sort((a, b) => a.bar - b.bar);

  const counts = new Map<string, number>();
  for (const c of sorted) {
    const n = label(c.chord, keyAt(c.bar));
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  const favourite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    log,
    moments: picked,
    blocks: blocks.map((b) => ({
      bars: `${b.from}-${b.to}`,
      who: b.items[0]?.who ?? 'frog',
      chords: b.items.map((c) => c.name),
      numerals: b.items.map((c) => label(c.chord, keyAt(c.bar))),
    })),
    stats: {
      bars: log.bars,
      chords: sorted.length,
      yours: sorted.filter((c) => c.who === 'you').length,
      frogs: sorted.filter((c) => c.who === 'frog').length,
      distinct: new Set(sorted.map((c) => c.name)).size,
      colour: sorted.filter((c) => !isDiatonic(c.chord, keyAt(c.bar))).length,
      favourite,
    },
  };
}

/** The progression cut into the phrase-length blocks it was played in. */
function blocksOf(log: JamLog, progression: LogChord[]) {
  const out: { from: number; to: number; items: LogChord[] }[] = [];
  for (const c of progression) {
    const b = Math.floor((c.bar - 1) / log.phraseBars);
    let block = out.find((x) => x.from === b * log.phraseBars + 1);
    if (!block) out.push((block = { from: b * log.phraseBars + 1, to: (b + 1) * log.phraseBars, items: [] }));
    block.items.push(c);
  }
  return out;
}

function metaLine(a: JamAnalysis): string {
  const keys = [a.log.startKey, ...a.log.keyChanges.map((k) => k.to)].map(keyName);
  return `${a.stats.bars} bars · ${keys.join(' → ')} · ${a.stats.chords} chords`;
}

/** The report without Gemini: the analysis's own words. */
export function localReport(a: JamAnalysis): JamReport {
  const top = [...a.moments].sort((x, y) => y.weight - x.weight)[0];
  const highlight = (m: Moment) =>
    m.type === 'keyChange' ? `the key change to ${m.title.split('→ ')[1]}`
      : m.type === 'borrowed' ? `that borrowed ${m.numerals[0]}`
        : /^(The|A) /.test(m.title) ? m.title.replace(/^The /, 'the ').replace(/^A /, 'that ') : `that ${m.title.toLowerCase().replace(/ \(.*\)$/, '')}`;
  const where = a.log.keyChanges.length ? `${keyName(a.log.startKey)}, ending in ${keyName(a.log.keyChanges[a.log.keyChanges.length - 1].to)}` : keyName(a.log.startKey);
  const summary = top
    ? `${a.stats.bars} bars in ${where}! Best bit: ${highlight(top)} at bar ${top.bar}.`
    : `${a.stats.bars} bars in ${where}, nice and steady. Try more weirdness for some surprises!`;
  const trivia = [...new Set(a.moments.map((m) => TRIVIA[m.type]).filter(Boolean))].slice(0, 2);
  return {
    summary,
    moments: a.moments.map((m) => ({ bar: m.bar, title: m.title, text: m.text })),
    trivia,
    meta: metaLine(a),
    source: 'local',
  };
}

// ---- Gemini ----

/** What Gemini gets: the analysis as compact facts (chord names, numerals, bars; nothing else about you). */
export function geminiFacts(a: JamAnalysis) {
  return {
    key: keyName(a.log.startKey),
    keyChanges: a.log.keyChanges.map((k) => ({ bar: k.bar, from: keyName(k.from), to: keyName(k.to) })),
    tempoBpm: Math.round(a.log.bpm),
    bars: a.stats.bars,
    progression: a.blocks.slice(0, 16).map((b) => ({ bars: b.bars, by: b.who === 'you' ? 'player' : 'frog', chords: b.chords.join(' '), numerals: b.numerals.join(' ') })),
    moments: a.moments.map((m) => ({ bar: m.bar, by: m.who === 'you' ? 'player' : 'frog', what: m.title, chords: m.chords.join(' '), numerals: m.numerals.join(' '), note: m.text })),
    stats: a.stats,
  };
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    moments: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { bar: { type: 'INTEGER' }, title: { type: 'STRING' }, text: { type: 'STRING' } }, required: ['bar', 'title', 'text'] },
    },
    trivia: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'moments', 'trivia'],
};

/** The generateContent request body (the main process adds the API key and sends it). */
export function geminiRequest(a: JamAnalysis) {
  const prompt = [
    'You are Jam Frog, a cheerful frog who just jammed chords with a musician (the "player"). Write a short jam report from the JSON facts below.',
    'Rules:',
    '- Talk about chords as Roman numerals (with the chord name in brackets the first time), e.g. "♭VII (B♭)".',
    '- Only mention chords, bars and moments that are in the facts. Never invent chords or bars.',
    '- Say clearly when a chord is a substitution (tritone substitution, relative/functional substitution, borrowed chord, secondary dominant).',
    '- summary: 1-2 sentences, at most 30 words, in the frog\'s voice, about the jam overall.',
    `- moments: at most ${MAX_MOMENTS}, one per notable moment in the facts (key changes first), in bar order; title at most 6 words; text at most 30 words.`,
    '- trivia: 1-2 true, interesting music facts related to what was played, at most 30 words each.',
    '',
    JSON.stringify(geminiFacts(a)),
  ].join('\n');
  return {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 900, responseMimeType: 'application/json', responseSchema: SCHEMA },
  };
}

const clip = (s: unknown, words: number) => {
  const w = String(s ?? '').trim().split(/\s+/).filter(Boolean);
  return w.length > words ? `${w.slice(0, words).join(' ')}…` : w.join(' ');
};

/**
 * Gemini's answer (the generateContent response JSON) as a report, kept short and to the jam's real bars.
 * Null if it isn't usable; the local report is used then.
 */
export function parseGeminiReport(response: unknown, a: JamAnalysis): JamReport | null {
  try {
    const text = (response as { candidates?: { content?: { parts?: { text?: string }[] } }[] })?.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? '').join('');
    if (!text) return null;
    const r = JSON.parse(text) as { summary?: unknown; moments?: unknown; trivia?: unknown };
    if (typeof r.summary !== 'string' || !r.summary.trim() || !Array.isArray(r.moments)) return null;
    const moments = r.moments
      .filter((m): m is { bar: number; title: string; text: string } => !!m && typeof m === 'object' && Number.isFinite(m.bar) && typeof m.title === 'string' && typeof m.text === 'string')
      .filter((m) => m.bar >= 1 && m.bar <= a.stats.bars)
      .slice(0, MAX_MOMENTS)
      .map((m) => ({ bar: Math.round(m.bar), title: clip(m.title, 8), text: clip(m.text, 40) }))
      .sort((x, y) => x.bar - y.bar);
    const trivia = (Array.isArray(r.trivia) ? r.trivia : []).filter((t): t is string => typeof t === 'string' && !!t.trim()).slice(0, 2).map((t) => clip(t, 40));
    return { summary: clip(r.summary, 40), moments, trivia, meta: metaLine(a), source: 'gemini' };
  } catch {
    return null;
  }
}
