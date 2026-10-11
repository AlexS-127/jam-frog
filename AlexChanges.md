# Alex's Jam Frog Changes

Alex coordinated the team (lanes, reviews, merges, testing in Live) and built the app's engine, bridge, model
pipeline and most of the overlay's behaviour, working with Claude Code. Commits authored **Claude** on `main` come
from Alex's Claude Code sessions. Alex built the Max for Live devices by hand in Max, following step-by-step
walkthroughs. Most of the work went straight to `main`, as agreed in `TEAMWORK.md`; PR #5 was the exception.

## PR history

| PR | Author | Status | Summary |
| --- | --- | --- | --- |
| [#1 — GRU chord model](https://github.com/AlexS-127/jam-frog/pull/1) | Katie Duong | Merged by Alex | Reviewed and merged, then wired into the app with a model picker (`995b9d0`). |
| [#2 — Amp and sprite UI prototype](https://github.com/AlexS-127/jam-frog/pull/2) | Kevin Gan | Merged by Alex | Reviewed, merged and wired into the app, fixing three bugs on the way (`bd52fb7`). |
| [#3 — Blind listening test page](https://github.com/AlexS-127/jam-frog/pull/3) | Kevin Gan | Closed | The listening test reached `main` separately, in `f0eb52f`. |
| [#5 — Genre outfits and amp redesign](https://github.com/AlexS-127/jam-frog/pull/5) | Alex S | Merged | The frog sits on a guitar amp (controls in the head, screen in the cabinet) and dresses for the genre. It also merged in Kevin's showcase site. |

## Alex's work, by area

### 1. Bridge: Ableton ↔ app

- **First spike:** the Electron + Vite + TypeScript overlay app, with an IAC MIDI-port spike (`a04a5d0`).
  - Web MIDI permission fixes followed (`0abb51d`).
  - The SETUP.md steps were written up exactly as taken in Live 12: IAC ports, Live settings, and the Tap / Me / Frog tracks (`6a9bbef`, `4057497`).
- **OSC bridge to Max for Live (`23bd3f0`):**
  - The Electron main process listens on `127.0.0.1:9001` and sends to `9002`.
  - The page reaches it through the preload (`window.jamFrog.osc`).
- **Max for Live devices, built by Alex in Max (`6bcfda1`):**
  - **Frog Ear** sends the player's notes: `midiin → midiparse → /note`.
  - **Frog Voice** plays the frog's notes from `/note`, and reports Live's `/tempo` and a `/bar` at every bar line.
  - Each device is checked in as `.amxd` with a readable `.maxpat.json` export.
  - SETUP.md records the devices as built, with every gotcha met along the way (`d3f7645`).
- **Max for Live is now the only bridge:** the IAC/Web MIDI ports bridge and its echo filter were removed (`f9ffae1`).
  - The app asks for no browser permissions at all, which also silences Chromium's "background-sync denied" log.

### 2. Team plan

- **`TEAMWORK.md`** (`bceff8a`, `d44849a`, `127946d`):
  - lanes for Alex, Kevin, Katie and Claude;
  - frozen shared contracts (the note, chord, model and UI interfaces), so everyone could work in parallel;
  - `main` as the integration branch;
  - a step-by-step push and PR guide.

### 3. Model lane: data, n-gram, GRU

- **Chordonomicon prep and n-gram baseline (`89818be`, refined in `2c3e613`):**
  - The 119-token vocabulary: chord changes as intervals × 9 qualities.
  - A shared 5-gram with per-genre trigrams and interpolated absolute discounting.
  - Test accuracy: **56.2% top-1 / 79.6% top-3**.
- **Power chords as their own class (`c26f86a`, `735a131`):**
  - Alex's call: on theory grounds, power chords are not major chords.
  - Root plus fifth is detected and voiced without repeating a note (`07fc5bf`).
- **Katie's GRU in the app (`995b9d0`):** wired in with a model picker, with caching and time-sliced planning so it stays fast.
- **Retrained GRU (`ee30959`):** trained on all 2.6M training sections, giving **61.5% / 83.3%**. It is the app's default model.
- **`train_gru.py` improvements (`2cdf5cb`, `335b3ee`, `834db64`):**
  - compares every run with the real n-gram and the current GRU, and never exports a worse model;
  - a `--trial` mode for sizing experiments;
  - full training runs for bigger 1-layer GRUs.

### 4. The engine: suggestions, answers, jams

- **Live suggestions (`a062c6c`):**
  - The next three chords, reshaped by a **weirdness** knob (temperature, top-k, borrowed-chord boost) and a genre.
  - Never uniform, and never a repeat of the last chord.
- **Answers on the bar (`bf24e02`, `2c3e613`):** call and response in 2, 4 or 8-bar phrases. The frog answers on the next downbeat, for as many bars as you played.
- **Answers that fit:**
  - in the player's register, with a bass note if they play one (`5b30f4c`);
  - in a session-wide key with recency weighting (`1816665`);
  - planned in the background within a 150 ms budget, in time slices (`1816665`).
- **Bar clock fix (`e7d8277`):** the bar counter jumped on chords when the app's BPM differed from Live's. It now measures Live's real bar length.
- **Full-length answers and anticipation (`f9ffae1`):**
  - "If I give 4 bars, give me 4 bars": one answer chord per chord change, on the player's own change positions.
  - Chords the player struck just before the bar are answered just before the bar too.
- **Copy my rhythm (`e0517e0`):** the frog answers in the player's strike positions, lengths, re-strikes and velocities, with natural velocity variation.
- **Jam mode (`834db64`):** after the phrase, the frog keeps playing block after block until **Stop**. You can play along over it.
- **Jam refinements (`2d9233d`, `06bcfbe`):**
  - **About one chord per bar:** jam blocks sometimes hold a chord for two bars or split a bar for a turnaround.
  - **The next block shows ahead of time,** and is exactly what plays next.
  - **Weirdness stays in key.** The jam's key is fixed to the player's, and colour chords (borrowed chords, secondary dominants) are capped and must resolve. Measured at weirdness 1: out-of-key chords went from 22–32% to 0%.
  - **The key centre is shown and tracked with hysteresis.** If the player moves to a new key mid-jam, the frog follows.
  - **Crash fix:** a power chord in a narrow register used to throw "no voicing".
- **Keep removed (`93543b9` → `eec1140`):** the `.mid` export was built, then removed at Alex's request. Jams are recorded in Live instead (SETUP.md, "Recording a jam").

### 5. The overlay

- **Kevin's overlay wired in (`bd52fb7`):** with fixes for its keyboard range, a hidden 4th answer chord, and inputs being overwritten while focused.
- **Simpler, bigger overlay (`f9ffae1`):**
  - 440×640, with the frog fixed on the controls;
  - a speech bubble suggesting chords instead of mini keyboards;
  - a ⚙ settings panel for the model and the fallback BPM.
- **Weirdness knob (`834db64`):** vertical drag relative to where you press, with no focus ring.
- **Bar-by-bar screen (`06bcfbe`):**
  - one box per bar, each chord as wide as it lasts, so mid-bar changes and held chords are visible;
  - the current bar lit;
  - the next jam block below, in blue;
  - a key label that flashes on key changes.
- **The frog dances in time (`06bcfbe`):** its loops last whole beats and restart on Live's bar lines.
- **Amp redesign and genre outfits (PR #5, `990da01`):**
  - No background: the frog sits on a guitar amp. The head holds the logo plate and controls; the cabinet front is the chord screen, in grille cloth.
  - The frog first wore Kevin's four outfits by genre. Kevin's PR #6 then replaced these with eight complete animated genre frogs.

### 6. Listening test

- **Blind A/B listening test (`f0eb52f`):** a page that plays seeded progressions and an n-gram vs GRU answer on the frog track, hidden and shuffled. You vote, then reveal. Open it from the menu (Cmd+Shift+L).

### 7. Jam report (Gemini)

- **What it is (`06bcfbe`):** when you press Stop on a jam, the frog sums it up in its bubble, and **Full report** lists up to 6 moments and 2 pieces of trivia.
- **What it finds,** written in Roman numerals:
  - key changes and what kind they are;
  - tritone substitutions and functional substitutions (vi for I, ii for IV);
  - borrowed chords and secondary dominants (V7/ii);
  - deceptive and plagal cadences;
  - famous progressions: four-chord pop, '50s, Andalusian, the Mario cadence, ii–V–I.
- **How it's written:**
  - The analysis runs locally (`core/report.ts`). Gemini (`gemini-flash-lite-latest`, about 1,200 tokens per report) turns it into the frog's voice.
  - Gemini is told to use only chords and bars from the jam, and its answer is cut to length.
  - If there's no key, or Gemini fails, the local report is used.
- **Privacy:**
  - The API key lives in `app/.env.local` (git-ignored). Only the main process reads it; the page never sees it.
  - With Gemini on, only chord names, numerals, bars, key and tempo leave the machine, once per jam. The README's "What leaves your machine" section says so.
  - With **Jam report → On this Mac only**, nothing leaves the machine.

### 8. Genre sounds

- **The frog's sound follows the genre (`7aa6709`):**
  - Frog Voice takes `/genre` and switches the Frog track's Instrument Rack chain on the next bar line.
  - The genre picker collapses to six styles, each averaging the model's predictions for its genres.

## Current result

- **Bridge:** Live → Frog Ear → app → Frog Voice → Live, all on localhost.
- **Models:** a GRU (default) and an n-gram. On the same test sample:

  | Model | Top-1 | Top-3 |
  | --- | --- | --- |
  | GRU | 61.5% | 83.3% |
  | n-gram | 56.2% | 79.6% |

- **Frog modes:** Off, Answer and Jam, all bar-accurate with Live's transport.
- **Tests:** 151 of 152 unit tests pass on `main`. The one failure is the GRU's 5 ms speed check: it passes when run alone, and fails only when all test files run in parallel on a busy machine.
