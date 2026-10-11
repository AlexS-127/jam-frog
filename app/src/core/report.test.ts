import { describe, expect, it } from 'vitest';
import type { JamLog, LogChord } from './answer';
import { parseChordName } from './chords';
import { analyseJam, geminiRequest, label, localReport, numeral, parseGeminiReport } from './report';

const C = { tonic: 0, minor: false };
const Am = { tonic: 9, minor: true };
const sym = (name: string) => parseChordName(name)!;

/** a jam log from bars of chord names: "you: C Am F G | frog: C F G C | ..." (one chord per bar unless more) */
function jam(blocks: [who: 'you' | 'frog', bars: string][], extra: Partial<JamLog> = {}): JamLog {
  const chords: LogChord[] = [];
  let bar = 1;
  for (const [who, text] of blocks) {
    for (const cell of text.split('|')) {
      const names = cell.trim().split(/\s+/).filter(Boolean);
      names.forEach((name, i) => chords.push({ who, bar, beat: (i * 4) / names.length, chord: sym(name), name }));
      bar++;
    }
  }
  return { chords, startKey: C, keyChanges: [], phraseBars: 4, bpm: 120, bars: bar - 1, ...extra };
}

describe('Roman numerals', () => {
  it('names chords by degree, with case for minor and ♭ for borrowed roots', () => {
    expect(['C', 'Dm', 'Em', 'F', 'G7', 'Am7', 'Bdim', 'Bb', 'Ab', 'Fm', 'Cmaj7'].map((n) => numeral(sym(n), C)))
      .toEqual(['I', 'ii', 'iii', 'IV', 'V7', 'vi7', 'vii°', '♭VII', '♭VI', 'iv', 'Imaj7']);
    expect(['Am', 'G', 'F', 'E7', 'C'].map((n) => numeral(sym(n), Am))).toEqual(['i', '♭VII', '♭VI', 'V7', '♭III']);
  });
  it('labels secondary dominants as V/x', () => {
    expect(['A7', 'D', 'E7', 'C7', 'G7'].map((n) => label(sym(n), C))).toEqual(['V7/ii', 'V/V', 'V7/vi', 'V7/IV', 'V7']);
  });
});

describe('jam analysis', () => {
  it('finds a tritone substitution, a secondary dominant, a borrowed chord and a deceptive cadence', () => {
    const a = analyseJam(jam([
      ['you', 'C | Am | Dm | G'],
      ['frog', 'C | A7 | Dm | Db7'],
      ['frog', 'C | Ab | G | Am'],
    ]));
    const titles = a.moments.map((m) => `${m.bar} ${m.title}`);
    expect(titles).toContain('6 Secondary dominant (V7/ii)');
    expect(titles).toContain('8 Tritone substitution');
    expect(titles).toContain('10 Borrowed chord: ♭VI');
    expect(titles).toContain('12 Deceptive cadence');
    expect(a.moments.find((m) => m.type === 'tritone')!.numerals).toEqual(['♭II7', 'I']);
    expect(a.moments.length).toBeLessThanOrEqual(6);
    expect(a.moments.map((m) => m.bar)).toEqual([...a.moments.map((m) => m.bar)].sort((x, y) => x - y));
  });

  it('spots well-known progressions and functional substitutions between blocks', () => {
    const a = analyseJam(jam([
      ['you', 'C | G | Am | F'],
      ['frog', 'C | G | Am | F'],
      ['frog', 'Am | G | Am | F'],
    ]));
    const types = a.moments.map((m) => m.title);
    expect(types).toContain('The "four chords" progression');
    expect(types).toContain('Substitution: vi for I');
    expect(a.blocks.map((b) => b.numerals.join(' '))).toEqual(['I V vi IV', 'I V vi IV', 'vi V vi IV']);
  });

  it('reports key changes first-class, with what kind they are', () => {
    const G = { tonic: 7, minor: false };
    const a = analyseJam(jam([['you', 'C | F | G | C'], ['frog', 'C | F | G | C'], ['frog', 'G | C | D | G']], { keyChanges: [{ bar: 9, from: C, to: G }] }));
    const k = a.moments.find((m) => m.type === 'keyChange')!;
    expect(k.title).toBe('Key change: C major → G major');
    expect(k.text).toContain('dominant');
    expect(localReport(a).meta).toBe('12 bars · C major → G major · 12 chords');
  });

  it('writes a short local report', () => {
    const a = analyseJam(jam([['you', 'C | Am | F | G'], ['frog', 'C | Ab | Bb | C']]));
    const r = localReport(a);
    expect(r.source).toBe('local');
    expect(r.summary.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(r.moments.map((m) => m.title)).toContain('The Mario cadence');
    expect(r.trivia.length).toBeGreaterThan(0);
  });
});

describe('Gemini', () => {
  const a = analyseJam(jam([['you', 'C | Am | F | G'], ['frog', 'C | A7 | Dm | G7']]));

  it('asks for short JSON, built only from the jam facts', () => {
    const req = geminiRequest(a);
    const text = req.contents[0].parts[0].text;
    expect(text).toContain('Roman numerals');
    expect(text).toContain('"numerals":"I V7/ii ii V7"');
    expect(req.generationConfig.responseMimeType).toBe('application/json');
    expect(req.generationConfig.maxOutputTokens).toBeLessThanOrEqual(1000);
  });

  it('reads the response, keeps it short, and drops moments outside the jam', () => {
    const body = { summary: 'What a jam!', moments: [
      { bar: 6, title: 'V7/ii (A7)', text: 'A7 pulls to Dm.' },
      { bar: 99, title: 'Made up', text: 'Not in this jam.' },
      ...Array.from({ length: 8 }, (_, i) => ({ bar: 1 + i, title: 'x', text: 'word '.repeat(80) })),
    ], trivia: ['one', 'two', 'three'] };
    const r = parseGeminiReport({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }, a)!;
    expect(r.source).toBe('gemini');
    expect(r.moments.length).toBe(6);
    expect(r.moments.every((m) => m.bar <= 8)).toBe(true);
    expect(Math.max(...r.moments.map((m) => m.text.split(' ').length))).toBeLessThanOrEqual(41);
    expect(r.trivia).toEqual(['one', 'two']);
  });

  it('returns null for anything unusable', () => {
    expect(parseGeminiReport({}, a)).toBeNull();
    expect(parseGeminiReport({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }, a)).toBeNull();
    expect(parseGeminiReport({ error: { message: 'quota' } }, a)).toBeNull();
  });
});

describe('local summary wording', () => {
  it('names the best moment naturally', () => {
    const tri = analyseJam(jam([['you', 'C | Am | F | G'], ['frog', 'C | Dm | Db7 | C']]));
    expect(localReport(tri).summary).toBe('8 bars in C major! Best bit: that tritone substitution at bar 7.');
    const G = { tonic: 7, minor: false };
    const k = analyseJam(jam([['you', 'C | F | G | C'], ['frog', 'G | C | D | G']], { keyChanges: [{ bar: 5, from: C, to: G }] }));
    expect(localReport(k).summary).toBe('8 bars in C major, ending in G major! Best bit: the key change to G major at bar 5.');
  });
});
