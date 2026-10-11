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
| Chordonomicon prep + n-gram (5-gram: top-1 56.2%, top-3 79.6%) | `model/`, `model/export/ngram.json` |
| Shared contracts: `NoteSource`, `NoteSink`, `ChordModel`, tokens, `Suggestion`, `AnswerPlan`, `FrogMood` | `app/src/core/` |

## Who does what

Only **Alex** has Ableton Live Suite, so anything that has to be tested in Live goes to Alex. Kevin and Katie build
against the shared contracts and check their work without Live, using mock data, a fake model, unit tests or Python.
Alex verifies everything in Live at the two integration points (9 PM and 11 PM).

| Who | Lanes, in order | Needs Live? | How they check their own work |
| --- | --- | --- | --- |
| **Alex** | Integration in `main.ts`, Ableton demo Set, hand tests at each integration, merging PRs, demo rehearsal, Max stretch | Yes | Playing it in Live |
| **Kevin** | **B** overlay UI → **E** listening test page → put **F**'s sprites in the UI → demo video + slides | No | `ui/demo.html` with mock data in a browser; `npm test` |
| **Katie** | **D** GRU (5-hour box) + `gru.ts` → **F** frog sprites in Adobe tools → pitch story | No | Test accuracy vs the n-gram (56.2% / 79.6%) |
| **Claude** (in Alex's session) | **A1** suggestions engine → **A2** answers + voicing → **C** Keep | No | Unit tests; Alex checks in Live |

**Why this shape:**
- Alex's hours in Live are the scarcest resource, so they go to integration and the demo, not lane code.
- Kevin and Katie have work with no Ableton dependency at all, so neither waits on Alex.
- If the GRU misses its 5-hour box, Katie moves straight on to art and pitch; nobody goes idle.

**Hearing the app without Live (optional):**
- **Ableton's free 30-day trial of Live 12 Suite** (Max for Live included) runs the full setup from `ableton/SETUP.md`.
- **GarageBand** (free on Mac) can play the frog's notes through the IAC ports, using the overlay's **Ports** bridge.
  Set up the ports with steps 1–2 of the Ports bridge section in `ableton/SETUP.md`.

### Kevin's order of work

1. **B, overlay UI.** Build `ui/overlay.ts` and `ui/demo.html` against the `UiState` / `Handlers` interfaces below, using placeholder frogs.
   Deliver it by the **9 PM** integration.
2. **E, listening test page.** Start with the fake model; switch to the real n-gram when A1 lands on `main`.
3. Swap Katie's sprites into the UI when she pushes them.
4. Demo video (screen recording of Alex's run-through) and pitch slides.

### Katie's order of work

1. **D, GRU.** Run `prepare.py`, then `train_gru.py`, ONNX export, `gru.ts`, accuracy report. **Hard stop 5 hours after you start;**
   tell Alex your start time.
2. **F, frog sprites** in Illustrator/Express/Firefly: 4 moods as SVG. Push them early, even rough, so Kevin can wire them in.
3. The pitch story for the Adobe Creative track: how the sprites and visuals were made with Adobe tools.

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

### Lane A1 (Claude): prediction engine (`app/src/core`). **Done** (`ngram.ts`, `key.ts`, `sampler.ts`, `suggest.ts`, `voicing.ts`)

Feature 3, live suggestions. **Can start now.**

- `ngram.ts`: `NgramModel implements ChordModel`. A TypeScript port of `Predictor` in `model/build_ngram.py`
  (interpolated absolute discounting; the formula is in that file's docstring). Loads `model/export/ngram.json`.
- `sampler.ts`: `reshape(probs, {weirdness, prev, key, prior?})` returns a reshaped distribution;
  `sampleToken(dist, rng)` draws from it (for answers); `ranked(dist)` lists tokens best first.
  - **Low weirdness (0.3 and below):** plain probability ranking, sharpened, top 4.
  - **High weirdness:** higher temperature, wider top-k, rare moves and borrowed chords (♭VI, ♭VII, iv in major) boosted.
  - **Never uniform**, and never repeats the chord just played.
- `suggest.ts`: `suggest(history: Chord[], model, genre, weirdness): Suggestion[]` returns the 3 distinct best chords, each voiced near the last chord the player played.
- `key.ts`: estimate the key from the recent phrase. The sampler needs it for "borrowed".
- Tests for each.

**Done when:** the Python and TS n-gram give the same probabilities on 3 contexts (±1e-4), `predictNext` takes under
5 ms, and suggestions come back under 50 ms after a chord.

### Lane A2 (Claude): answers and voicing (`app/src/core`). **Done** (`answer.ts`, `voicing.ts`); hand test in Live pending

Feature 4, frog answers, as call and response in bars (changed at Alex's request from the original 1.5 s silence trigger):

- `voicing.ts`: voices answers in the register of the player's phrase (and with a bass note if they play a bass line), with the least total movement from the previous voicing.
- `answer.ts`, `AnswerEngine`:
  - **The phrase:** you pick a phrase length of **4 or 8 bars**. The phrase starts on the bar of your first chord (a chord in
    the last quarter of a bar counts for the next bar).
  - **The answer:** on the downbeat right after the phrase, if you played at least 2 chords, the frog answers for the same
    number of bars with 2 to 4 chords, changing on bar lines.
  - **Where bars come from:** Live's `/bar` while the transport runs. Otherwise, or if the transport stops mid-phrase, the
    engine counts bars itself from the BPM.
  - **Choosing the answer:** it generates about 48 candidates through the weirdness sampler and keeps the best by model
    likelihood plus a cadence bonus (ending on I or V), with penalties for ping-pong (A B A) and for echoing your phrase.
  - **Interrupting:** playing during an answer (after its first beat) cuts it off and starts a new phrase.

**Done when:** an answer lands on the bar in Live over the Max for Live bridge, with no stuck notes.

### Lane B (Kevin): overlay UI (`app/src/renderer/ui/`, `app/src/renderer/style.css`)

Feature 7. **Can start now with mock data**; no engine needed.

Build `createOverlay(root: HTMLElement, handlers: Handlers): { update(state: UiState): void }` in `ui/overlay.ts`:

```ts
interface UiState {
  mood: FrogMood; current: string | null; trail: string[]; suggestions: Suggestion[];
  answer: AnswerPlan | null; progress: AnswerProgress; // {status: 'idle'|'listening'|'playing', bar, bars}
  weirdness: number; genre: string; answersOn: boolean; phraseBars: 4 | 8;
  bridge: 'osc' | 'ports'; bpm: number; liveTempo: number | null; bar: number | null; status: string;
}
interface Handlers {
  onWeirdness(v: number): void; onGenre(g: string): void; onAnswersToggle(on: boolean): void;
  onKeep(): void; onBridge(b: 'osc' | 'ports'): void; onBpm(bpm: number): void; onPhraseBars(bars: 4 | 8): void;
}
```

What to build:
- frog sprite with 4 moods, showing "weird" when the knob is above 0.7 or a suggestion is `borrowed`
- chord trail
- 3 suggestion cards with a **mini keyboard** drawing each card's `voicing`
- weirdness knob (0 to 1)
- genre dropdown (`GENRES` + "all")
- answer toggle, phrase length (4 / 8 bars) with a "bar 2/4" counter, and Keep button
- bridge selector, BPM, and the Live tempo/bar line

Window constraints:
- 360×480, frameless and transparent; drag by the header (`-webkit-app-region: drag`).
- Use placeholder SVG frogs until lane F delivers.
- Add an `ui/demo.html` that feeds mock states, so it can be developed in a browser with `npx vite`.

**Done when:** the demo page cycles through all four moods and real-looking suggestions at 360×480. Alex wires it into `main.ts`.

### Lane C (Claude): Keep (`app/src/core/keep.ts`, `app/src/main/keep.ts`)

Feature 6. **Can start now.**

- `keep.ts` in core: `buildMidi(phrase: NoteEvent[], answer: NoteEvent[], bpm: number): Uint8Array` using `@tonejs/midi`.
  Use two tracks, "You" and "Frog", with times relative to the first note.
- `keep.ts` in main: a save dialog (`dialog.showSaveDialog`) that writes the bytes. This is the **only** file the app ever writes.
- Needs one new preload entry, `jamFrog.saveMidi(bytes)`. Ask Alex to add it to `preload.ts` and `env.d.ts`.

**Done when:** a unit test reads the bytes back with `@tonejs/midi` and finds the right notes, and a saved file drags into Ableton and plays.

### Lane D (Katie): GRU model (`model/train_gru.py`, `model/export/gru.onnx`, `app/src/core/gru.ts`)

**Time box: 5 hours from start.** Needs a laptop with PyTorch; Apple Silicon `mps` is fine.

1. `python model/prepare.py` (about 1 minute) gives `model/data/{train,val,test}.tsv.gz` and `export/vocab.json`.
2. `train_gru.py`:
   - an embedding of 64, plus a genre embedding (13: 12 genres + none/all) added at every step;
   - 1 to 2 GRU layers of 256, trained on the last 8 tokens;
   - under 1 hour of training, on a subsample if needed.
3. Export ONNX with input `[1, 8]` int64 tokens + genre id and output `[1, 119]` logits.
4. `gru.ts`: `GruModel implements ChordModel` with `onnxruntime-web`, taking under 5 ms per call.
5. Report test top-1 and top-3 in `model/README.md`, next to the n-gram's **56.2% / 79.6%** (5-gram). Use the same 20k-section sample (seed 0) as `build_ngram.py`.

**The GRU replaces the n-gram only if it's at least as accurate and passes the listening test (lane E).**
If the box runs out, we ship the n-gram.

### Lane E (Kevin): listening test page (`app/src/renderer/listening.html`, `listening.ts`)

Feature 8. **Can start now with a fake model**; it uses A1/A2 when they land.

- It plays 5 fixed progressions: `C Am F G`, `Am F C G`, `D A Bm G`, `Em C G D` and `C E7 Am F`.
- For each one, the frog's continuation is played at weirdness **0.1** and **0.9**, once per model (n-gram, and GRU if it exists), through the current `NoteSink`.
- The page shows what was played, so the team can vote.

**Done when:** it plays all 20 cases through Ableton (5 progressions × 2 weirdness × 2 models).

### Lane F (Katie, Kevin): art and pitch (`app/src/renderer/assets/`, `docs/`)

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

## How to push your work

`main` is the shared branch. **Never push straight to `main`.** Work on your own branch and open a pull request (PR).

### Once, when you start

```sh
git clone https://github.com/AlexS-127/jam-frog.git
cd jam-frog
git checkout main
git checkout -b lane/b-ui            # Kevin: lane/b-ui (then lane/e-listening)   Katie: lane/d-gru (then lane/f-art)
cd app && npm install && cd ..       # everyone (Node 20+)
python3 -m venv .venv && source .venv/bin/activate && pip install -r model/requirements.txt torch onnx   # Katie only
```

### Every time you've got something working (at least every 2 hours)

```sh
# 1. Get everyone else's latest work into your branch
git pull origin main                 # if it reports a conflict, see "If git says CONFLICT" below

# 2. Check nothing is broken (must pass before you push)
cd app && npm test && npm run typecheck && cd ..

# 3. Commit only your own lane's files
git status                           # look: only files your lane owns should be listed
git add <your files>                 # e.g. git add app/src/renderer/ui
git commit -m "UI: suggestion cards with mini keyboards"

# 4. Push your branch (the first push needs -u)
git push -u origin lane/b-ui
```

### Open the pull request

1. Go to https://github.com/AlexS-127/jam-frog. A yellow bar says **"lane/b-ui had recent pushes"**.
   Click **Compare & pull request**.
2. Check that **base** is `main` and **compare** is your branch.
3. Title it with what works now ("UI: overlay with mock data, all 4 moods"). In the description, say how to try it in 1–3 steps.
4. Click **Create pull request**.

### Who merges

- **If your PR only touches your own lane's files** and the tests pass, merge it yourself: **Merge pull request** →
  **Confirm merge**. Then post in the team chat so others pull.
- **If it touches a shared file** (`app/src/core/types.ts`, `vocab.ts`, `model.ts`, `app/src/renderer/main.ts`,
  `app/src/main/*`, `app/package.json`, `ableton/`, `README.md`), don't merge it. Ask Alex to review and merge.
- **Claude** pushes to its own branch (`claude/beautiful-wozniak-0p6ot6`); Alex asks Claude to merge it into `main`.

After a merge, keep working on the same branch. Run `git pull origin main` first, so you start from the merged state.

### If git says CONFLICT

1. Run `git status`. The conflicted files are listed under "both modified".
2. Open each one. Keep the right lines between the `<<<<<<<`, `=======` and `>>>>>>>` markers, then delete the markers.
3. Run `git add <file>`, then `git commit`, then re-run the tests.
4. **If the conflict is in a file you don't own,** stop and ask Alex. Don't guess.

### Other rules

- **New dependencies:** ask Alex first. The approved list is electron, vite, typescript, node-osc, @tonejs/midi,
  onnxruntime-web and vitest; for Python, datasets, pandas, torch and onnx.
- **Never commit** `model/data/` or `.venv/` (both in `.gitignore`), or any `node_modules/`.
- **Never force-push** (`git push -f`) a branch someone else might have pulled, and never to `main`.

## House rules that apply to every lane

- **Privacy:** no login, no analytics, no cookies, no persistent storage, no network calls. The only file written is the `.mid` from Keep.
- **Out of scope:** a VST/AU plugin, Ableton Remote Scripts or MCP, logic inside Max, audio or guitar recognition, computer vision,
  LLM chord prediction, accounts, a database, a phone app, melody generation.
- **Overruns:** if a task is running past 1.5× its expected time, tell Alex before continuing.
