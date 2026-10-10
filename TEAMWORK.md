# Splitting the work

How Jam Frog's remaining work splits into lanes that teammates can build at the same time without
blocking each other or colliding in git.

**Deadlines (ET):** feature freeze **Sun 3:00 AM**, hacking ends **Sun 9:00 AM**.

## Where we are (Sat ~3:45 PM)

| Done | Where |
| --- | --- |
| IAC spike: chord in → name → IV answer out, 62 ms round trip | `app/` |
| Chord detection (onset grouping, inversions, power chords), 21 tests | `app/src/core/chords.ts`, `grouper.ts` |
| Max for Live bridge: Frog Ear + Frog Voice, `/note` `/tempo` `/bar` over OSC | `ableton/`, `app/src/main/osc.ts` |
| Chordonomicon prep + n-gram (top-1 38.2%, top-3 69.8%) | `model/`, `model/export/ngram.json` |
| Shared contracts: `NoteSource`, `NoteSink`, `ChordModel`, tokens, `Suggestion`, `AnswerPlan`, `FrogMood` | `app/src/core/` |

## The contracts (frozen; ask Alex before changing)

Everything in a lane codes against these, so nobody waits for anybody else's implementation.

```ts
// app/src/core/types.ts
interface NoteSource { onNote(cb: (e: NoteEvent) => void): void; close(): void }   // e = {pitch, velocity, time}
interface NoteSink   { send(pitch: number, velocity: number): void; close(): void } // velocity 0 = note off
interface ChordSymbol { root: number; quality: Quality }  // root 0 = C; Quality = maj|min|dim|aug|sus|dom7|maj7|min7|pow
interface Suggestion { chord: ChordSymbol; name: string; voicing: number[]; prob: number; borrowed: boolean }
interface AnswerPlan { chords: { chord: ChordSymbol; name: string; voicing: number[] }[]; beatsPerChord: number }
type FrogMood = 'idle' | 'listening' | 'thinking' | 'weird'

// app/src/core/model.ts
interface ChordModel { readonly name: string; predictNext(context: Token[], genre: string): Float32Array }
// returns probabilities over all VOCAB_SIZE (119) tokens; specials are 0; genre is one of GENRES or "all"

// app/src/core/vocab.ts: Token layout shared with model/export/vocab.json
encode(chords: ChordSymbol[]): Token[]          // [BOS, START_q, interval tokens...]
decode(prevRoot: number, token: Token): ChordSymbol | null
```

MIDI 60 is C3 (Ableton's naming), so "C3 to C5" means MIDI 60 to 84.

## Lanes

Each lane lists the files it **owns**. Only edit your own files. If you need a change in someone else's file or
in a shared file, ask its owner.

### Lane A1: prediction engine (`app/src/core`)

Feature 3, live suggestions. **Can start now.**

- `ngram.ts`: `NgramModel implements ChordModel`. A TypeScript port of `Predictor` in `model/build_ngram.py`
  (interpolated absolute discounting; the formula is in that file's docstring). Loads `model/export/ngram.json`.
- `sampler.ts`, built around this signature:
  `reshape(probs: Float32Array, weirdness: number, prevRoot: number, key: {tonic: number; minor: boolean}): Float32Array`
  - **Low weirdness:** rank by probability.
  - **High weirdness:** raise the temperature, widen top-k, and boost borrowed chords from the parallel key (♭VI, ♭VII in major).
  - **Never sample uniformly at random.**
  - Also `sampleNext(...)`, for answers.
- `suggest.ts`: `suggest(history: Chord[], model, genre, weirdness): Suggestion[]` returns the 3 distinct best chords, each voiced near the last chord the player played.
- `key.ts`: estimate the key from the recent phrase. The sampler needs it for "borrowed".
- Tests for each.

**Done when:** the Python and TS n-gram give the same probabilities on 3 contexts (±1e-4), `predictNext` takes under
5 ms, and suggestions come back under 50 ms after a chord.

### Lane A2: answers and voicing (`app/src/core`)

Feature 4, frog answers. **Can start now** with a fake `ChordModel`.

- `voicing.ts`: voice a `ChordSymbol` between MIDI 60 and 84 with the least total movement from the previous voicing.
- `answer.ts`: an `AnswerEngine` that:
  - watches note events and fires after a configurable silence (default 1.5 s) once there are at least 2 chords;
  - builds an `AnswerPlan` of 2 to 4 chords (sampled autoregressively through A1's sampler; a stub until A1 lands);
  - schedules it into a `NoteSink`, one chord per 2 beats. It starts on the **next `/bar`** when Live's transport runs (we get `/bar`
    from Frog Voice); otherwise it starts right away, timed from `/tempo` and the UI's BPM.
- Tests with fake timers, in the same style as `grouper.test.ts`.

**Done when:** an answer lands on the bar in Live over the Max for Live bridge, with no stuck notes.

### Lane B: overlay UI (`app/src/renderer/ui/`, `app/src/renderer/style.css`)

Feature 7. **Can start now with mock data**; no engine needed.

Build `createOverlay(root: HTMLElement, handlers: Handlers): { update(state: UiState): void }` in `ui/overlay.ts`:

```ts
interface UiState {
  mood: FrogMood; current: string | null; trail: string[]; suggestions: Suggestion[];
  answer: AnswerPlan | null; weirdness: number; genre: string; answersOn: boolean;
  bridge: 'osc' | 'ports'; bpm: number; liveTempo: number | null; bar: number | null; status: string;
}
interface Handlers {
  onWeirdness(v: number): void; onGenre(g: string): void; onAnswersToggle(on: boolean): void;
  onKeep(): void; onBridge(b: 'osc' | 'ports'): void; onBpm(bpm: number): void;
}
```

What to build:
- frog sprite with 4 moods, showing "weird" when the knob is above 0.7 or a suggestion is `borrowed`
- chord trail
- 3 suggestion cards with a **mini keyboard** drawing each card's `voicing`
- weirdness knob (0 to 1)
- genre dropdown (`GENRES` + "all")
- answer toggle and Keep button
- bridge selector, BPM, and the Live tempo/bar line

Window constraints:
- 360×480, frameless and transparent; drag by the header (`-webkit-app-region: drag`).
- Use placeholder SVG frogs until lane F delivers.
- Add an `ui/demo.html` that feeds mock states, so it can be developed in a browser with `npx vite`.

**Done when:** the demo page cycles through all four moods and real-looking suggestions at 360×480. Alex wires it into `main.ts`.

### Lane C: Keep (`app/src/core/keep.ts`, `app/src/main/keep.ts`)

Feature 6. **Can start now.**

- `keep.ts` in core: `buildMidi(phrase: NoteEvent[], answer: NoteEvent[], bpm: number): Uint8Array` using `@tonejs/midi`.
  Use two tracks, "You" and "Frog", with times relative to the first note.
- `keep.ts` in main: a save dialog (`dialog.showSaveDialog`) that writes the bytes. This is the **only** file the app ever writes.
- Needs one new preload entry, `jamFrog.saveMidi(bytes)`. Ask Alex to add it to `preload.ts` and `env.d.ts`.

**Done when:** a unit test reads the bytes back with `@tonejs/midi` and finds the right notes, and a saved file drags into Ableton and plays.

### Lane D: GRU model (`model/train_gru.py`, `model/export/gru.onnx`, `app/src/core/gru.ts`)

**Time box: 5 hours from start.** Needs a laptop with PyTorch; Apple Silicon `mps` is fine.

1. `python model/prepare.py` (about 1 minute) gives `model/data/{train,val,test}.tsv.gz` and `export/vocab.json`.
2. `train_gru.py`:
   - an embedding of 64, plus a genre embedding (13: 12 genres + none/all) added at every step;
   - 1 to 2 GRU layers of 256, trained on the last 8 tokens;
   - under 1 hour of training, on a subsample if needed.
3. Export ONNX with input `[1, 8]` int64 tokens + genre id and output `[1, 119]` logits.
4. `gru.ts`: `GruModel implements ChordModel` with `onnxruntime-web`, taking under 5 ms per call.
5. Report test top-1 and top-3 in `model/README.md`, next to the n-gram's **38.2% / 69.8%**. Use the same 20k-section sample (seed 0) as `build_ngram.py`.

**The GRU replaces the n-gram only if it's at least as accurate and passes the listening test (lane E).**
If the box runs out, we ship the n-gram.

### Lane E: listening test page (`app/src/renderer/listening.html`, `listening.ts`)

Feature 8. **Can start now with a fake model**; it uses A1/A2 when they land.

- It plays 5 fixed progressions: `C Am F G`, `Am F C G`, `D A Bm G`, `Em C G D` and `C E7 Am F`.
- For each one, the frog's continuation is played at weirdness **0.1** and **0.9**, once per model (n-gram, and GRU if it exists), through the current `NoteSink`.
- The page shows what was played, so the team can vote.

**Done when:** it plays all 20 cases through Ableton (5 progressions × 2 weirdness × 2 models).

### Lane F: art and pitch (`app/src/renderer/assets/`, `docs/`)

**Can start now.** This lane makes the case for the **Adobe Creative track**, so use Adobe tools (Illustrator, Express, Firefly) and say so in the pitch.

- Frog sprites: `frog-idle.svg`, `frog-listening.svg`, `frog-thinking.svg` and `frog-weird.svg`, same size, transparent
  background, and readable at 64 px tall.
- A demo script (3 minutes), pitch slides, and a backup screen recording of the demo.

### Alex: coordination, integration and Ableton

- Owns the shared files: `app/src/core/types.ts`, `vocab.ts`, `model.ts`; `app/src/renderer/main.ts` (the wiring);
  `app/src/main/preload.ts` and `main.ts`; `app/package.json`; `ableton/`; `README.md`.
- Merges the lanes, keeps the demo Ableton Set working, runs the hand tests.
- Stretch work (only after the core is done), starting with the genre radar and then Keep writing clips into Live, the second of which uses the Max `js` walkthrough.

## Dependencies

```
contracts (done) ──┬── A1 engine ──────┬── integration in main.ts (Alex) ── demo
                   ├── A2 answers ─────┤        ▲
                   ├── B  UI (mocks) ──┤        │
                   ├── C  Keep ────────┘        │
                   ├── D  GRU ── gru.ts ── E listening test
                   ├── E  listening (fake model first)
                   └── F  art ── B swaps placeholder frogs
```

Nothing blocks on anything except the final wiring. A2 and E use a fake `ChordModel` until A1 lands:

```ts
const fake: ChordModel = { name: 'fake', predictNext: () => { const p = new Float32Array(119); p[11 + 5 * 9] = 1; return p; } }; // always IV
```

## Milestones (ET, Saturday into Sunday)

| By | What |
| --- | --- |
| **6 PM** | A1 n-gram TS matches Python. B demo page shows the layout. D first training run. F sketch of the frogs. |
| **8 PM** | A1 suggestions + sampler. A2 answers in tests. C `buildMidi` tested. |
| **9 PM** | **Integration 1:** live suggestions in the overlay with Ableton. GRU time box ends (if D started at 4 PM): ship or drop. |
| **11 PM** | **Integration 2:** answers land on the bar; Keep saves; real frog sprites in. |
| **1 AM** | E listening test run with the team; pick the model. README current. |
| **3 AM** | **Feature freeze.** Only bug fixes after this. |
| 3–8 AM | Demo rehearsal, recording, pitch. Stretch work only if everything above is solid. |

## Git rules

- **Integration branch:** `claude/beautiful-wozniak-0p6ot6` (there is no `main` yet). Branch off it as `lane/<letter>-<name>`,
  for example `lane/b-ui`, and open a PR back into it.
- **Pull often** (`git pull origin claude/beautiful-wozniak-0p6ot6`); keep PRs small and merge at least every 2 hours.
- **Before pushing:** `cd app && npm test && npm run typecheck`.
- **New dependencies:** ask Alex. The approved list is electron, vite, typescript, node-osc, @tonejs/midi,
  onnxruntime-web and vitest; for Python, datasets, pandas, torch and onnx.
- **Never commit** `model/data/` (it's in `.gitignore`).

## House rules that apply to every lane

- **Privacy:** no login, no analytics, no cookies, no persistent storage, no network calls. The only file written is the `.mid` from Keep.
- **Out of scope:** a VST/AU plugin, Ableton Remote Scripts or MCP, logic inside Max, audio or guitar recognition, computer vision,
  LLM chord prediction, accounts, a database, a phone app, melody generation.
- **Overruns:** if a task is running past 1.5× its expected time, tell Alex before continuing.
