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

## October 11 session: Claude Code and Codex

Changes made with Alex on October 11, 2026. Parts 1–7 record the Claude Code session; parts 8–9 record the
Codex sessions. Alex chose what to build and tested in Live. Work from other sessions is attributed below.

**Status:** all of it is committed on `main` (commit `e722377`, then merged with `origin/main`). At commit time the typecheck passed and all 164 tests passed.

### 1. The frog's sound follows the genre (Ableton, chain selector)

Picking a genre in the overlay now switches the Frog track's sound in Live.

- **App:** sends `/genre <index>` to Frog Voice over OSC. Frog Voice is told the current genre again whenever it
  (re)loads.
  - While Live plays, the switch waits for the next bar line. Otherwise it switches at once.
  - Notes the frog is holding are released first, so none hang on the old chain.
  - Files: `app/src/renderer/main.ts`, `app/src/renderer/bridges/osc.ts`, `app/src/main/osc.ts`.
- **Frog Voice** (`ableton/Frog Voice.amxd` and `.maxpat.json`): `route /note` became `route /note /genre`, feeding a
  new `[js frog_genre.js]` and `[print FrogGenre]`.
- **`ableton/frog_genre.js`:** finds the first Instrument Rack on the Frog track and the chain named after the genre.
  It moves the rack's **Chain Selector** to the middle of that chain's zone, so the zones must be spread evenly.
  - All styles plays the chain named `user`. If there isn't one, it plays a chain named `all`, then the first chain.
  - A genre without a chain keeps the current sound.
  - Each chain carries its own instrument, effects and send levels, using the rack's return chains.
- **Docs:** `ableton/SETUP.md` gained "A frog sound per genre", covering rack setup, zones and testing in the Max
  Console.

### 2. Six genres instead of twelve

- **Picker:** jazz, rock, electronic, country, pop and punk, plus All styles. Pop includes pop rock. Punk includes
  metal and alternative. Rap, soul and reggae are gone.
- **Models:** the models still know the 12 trained genres. A picker choice averages the predictions of its genres
  (`app/src/core/styles.ts`, `styled()`).
- **Sync check:** a test keeps the genre list in `frog_genre.js` in sync with the app's.

### Merging with Kevin's work

`origin/main` (Kevin's animated genre frogs, demo tape and site refresh, and the restored `KevinChanges.md`) was
merged in twice before the push.

- **Conflicts:** two, in `frog/looks.ts` and `frog/motion.test.ts`. Both were resolved with Kevin's versions.
- **Check:** before pushing, the merged branch was compared with `origin/main`. None of Kevin's files were deleted
  or changed.

### 3. Frog animation: slower, calmer, cuter

The frog no longer blinks constantly. Every idle frame used to play about once a second, including the eyes-shut
ones.

- **Idle:** he breathes with his eyes open and blinks for real every 2.5–5.5 s, with the odd double blink.
- **Cute moments:** every 2.5–5 s at rest he jumps, looks around, touches his chin, sticks his tongue out, or waves.
  - Outfits ponder with a side-eye instead of touching the chin, because their hands hold instruments.
  - The tongue reuses Kevin's pixel tongue from the site. It was later reworked to be frame-based (`tongue.ts`).
- **Speed:** every action is slower, for example wave 0.7 → 1.2 s, look around 1.0 → 2.6 s, and playing 1.1 → 2.0 s.
  Loops can now stretch over 8 beats when synced to Live.
- **Files:** `frog/motion.ts`, `frog/controller.ts`, `frog/looks.ts` (`OUTFIT_FRAMES`) and `frog/tongue.ts`.

### 4. Frog artwork in one folder

- **New location:** all frog art now lives in `app/src/renderer/ui/frog/sprites/a/`:
  - the classic frog's two sheets
  - Kevin's genre sheets, in `genres/`, moved from `site/assets/genre-animations/` with their history kept
- **Site:** the showcase site reads from the same folder. Its duplicate copies of the classic frog sheets were removed.
- **Versions:** `frog/sprites.ts` can load other versions of the art (`b/`, …) for A/B tests. A file missing from a
  version falls back to `a/`.
- **Scaling:** frame maps scale to sheets of another resolution, such as pixel-snapped art at about 1/5 size.
- **The A/B test:** a pixel-snapped version B was tested, and A won. B was deleted and the Frog art picker removed,
  but the loading code stays for future tests (`sprites/README.md`).

### 5. Ample Guitar strums for guitar genres

- **What gets strummed:** for jazz, rock, country and punk, the frog's answers go out as MIDI for **Ample Guitar's
  Strummer in Detect mode** instead of chord voicings. Electronic and pop keep normal voicings.
- **The MIDI:**
  - the chord in root position from C1, with root in C1–B1 and the rest up to B2
  - a strum key: C4 strums down. With Copy my rhythm, re-strikes alternate up (E4) and down.
  - strum keys at velocity 120, so all six strings are strummed
- **Source:** the key map comes from Ample's Strummer manual.
- **All styles setting:** All styles strums only when ⚙ Settings says the `user` chain is an Ample Guitar.
- **Files:** `app/src/core/strum.ts`, used by `answer.ts`. Setup is in `ableton/SETUP.md` ("Strummed guitar").

### 6. Overlay changes

- **Font:** Nunito, bundled with the app (`@fontsource-variable/nunito`, pinned to 5.2.6), so nothing is fetched
  from the network.
- **Speech bubble:** a translucent, slightly blurred box beside the frog, with a small tail at its bottom left. It
  replaced the mouth-tracking bubble.
- **Chord names:** a name that doesn't fit its stretch of the bar now shrinks to fit, instead of being cut off at the
  bar line.
- **Rap removed:** gone from the showcase site's outfit picker ("Seven pixel-art players") and from the app's outfit
  list. Kevin's `rap.png` file was kept.
- **⚙ Settings:**
  - **Chord names:** letters (C, Am, G7) or **Roman numerals** in the session key (I, vi, V7, V7/ii).
  - **Copy my rhythm:** moved here from the main panel.
  - **All styles: user chain is Ample Guitar (strum):** on by default.

### 7. Jam mode follows the weirdness knob

While jamming, turning the weirdness knob now re-plans the next block in the background, so the change is heard
from the next block on. Before, the next block was already planned with the old weirdness. The block playing keeps
its chords, as does a block that has already started early on an anticipation (`AnswerEngine.settingsChanged()`).

### 8. Pixel-art amps and three-frame tongues (Codex)

- **Amp artwork:** the overlay amp now uses square pixel-style edges, hard grille patterns, corner protectors,
  feet, trim, a handle, a logo plate and pixel-style controls.
- **Genre-inspired amps:** the selected genre sets the amp's look: jazz gets a tweed-style combo, rock a
  black-and-gold stack, punk a battered amp with stickers, alternative a teal-and-silver combo, pop a
  cream-and-pink amp, country a tweed-and-wood look, and electronic a dark rack-style amp with blue accents
  and indicator lights. The classic look uses a dark amp.
- **Site amp:** the small amp in the showcase site's response artwork also has a pixel-art cabinet, grille,
  controls and shadow.
- **Tongue animation:** the classic frog and every outfit use exactly three frames: default idle, tongue half
  out, tongue fully out. The tongue is centered at the mouth and extends toward the front like a human
  tongue. The sequence lasts 900 ms and uses the default idle artwork underneath all three frames.
- **Shared rendering:** the app, animation frame review and site use the same frame-based tongue renderer.
  The site's movement picker now includes **Tongue**; the site's previous random tongue pulses were removed.
- **Files:** `app/src/renderer/ui/overlay.ts`, `overlay.css`, `frog/motion.ts`, `frog/tongue.ts`,
  `frog/looks.ts`, `frog/controller.ts`, `frog/review.ts`, plus `site/frog-looks.js`, `site/index.html`
  and `site/styles.css`.
- **Verification:** app typecheck passed, all 163 tests across 20 test files passed, and the production build
  passed. Vite reported a large model-bundle warning. The showcase loaded at `http://127.0.0.1:5173/`;
  visual review of the animation and genre amps was not completed in this session.

### 9. Musician-first website and hosting (Codex)

- Rebuilt the showcase around a white seven-frog selector: Jazz, Rock, and Punk
  on the left, a larger classic All styles frog in the center, then Pop, Country,
  and Electronic. The sprites stay still at rest and show neutral, half-out,
  and full-out tongue frames on hover or keyboard focus.
- Each selection opens its genre's recording, or a labeled silent illustrated
  preview if a recording is missing. Preview videos can be rendered and downloaded
  in the browser. Added optional VTT caption support and playback-error fallback.
- Created site/demo-videos/ with documented recording names, plus docs/art/ for
  the automatically loaded closing drawing. No recordings or drawing were present
  when the site was built.
- Added the musician-first philosophy, working beyond genre labels without
  claiming automatic ambient classification, Suggest/Answer/Jam examples and
  weirdness controls, Ableton workflow benefits, and an example custom ambient
  user-rack recipe.
- Added six clearly marked Ableton possibilities, the combined team build journey,
  model results, technical challenges, requirements and setup links, and precise
  explanations of local processing and optional Gemini report data.
- Added the site:build command and fixed preview access to the shared sprite,
  font, and artwork folders. Build output and the Vite cache are ignored by Git.
- Verification: production site build, JavaScript syntax checks, and app typecheck
  passed. Browser checks covered the desktop lineup, three tongue frames and reset,
  390 px and 320 px layouts without horizontal overflow, mode/weirdness controls,
  and an illustrated preview completing as a playable, downloadable video.
- Deployed a private Sites preview at
  https://jam-frog-bandmate.ampletapir9.chatgpt.site. Registered jamfrog.us and
  www.jamfrog.us with the host; both await DNS validation. Public access was not
  authorized. The exact GoDaddy DNS records and launch steps are in
  docs/website-hosting.md. Nothing was changed in the user's GoDaddy account.

### Not done or still open

- **Untested in Live:** nothing was run in Live from this session. That includes the Max device change, the Chain
  Selector and Ample Detect mode, which Alex is testing in Live.
- **Genre changes mid-jam:** the chords still change from the block after next. Only weirdness was made to re-plan.
- **The site's idle frogs:** still blink every loop. Only the app got the new idle behaviour.
- **Left out of git:** an empty root `package-lock.json` (left over from an `npm` run outside `app/`). `site/.vite/`,
  Vite's cache, is already in `.gitignore`.
