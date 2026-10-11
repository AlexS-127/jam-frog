# Jam Frog 🐸

A real-time jam partner for Ableton Live Suite 12 (Hacklanta 2026, Adobe Creative track).

You play chords in Ableton. A frog overlay floats above Live and:

1. **Suggests** what to play next, in a speech bubble ("Try **F**, **Am** or **G**"), every time it recognises a chord.
2. **Answers** (toggle): you play a 2, 4 or 8-bar phrase; on the next downbeat the frog answers with as many bars of
   its own chords on its Ableton track, changing chord where you did (anticipations included), in your register.
3. **Jams** (FROG: Jam): after your phrase it keeps playing, phrase after phrase, about one chord per bar (sometimes
   one more or one fewer), in your key, until you press **Stop**. The next block shows under the current one so you
   can get ready. Play along over it; if you move to a new key, the frog follows.
4. **Reports** on the jam when you press Stop: the frog sums it up in its speech bubble, and **Full report** lists the
   interesting moments in Roman numerals (key changes, substitutions, borrowed chords, secondary dominants, cadences,
   famous progressions) with a little trivia. Written by Gemini if you add an API key (see below), otherwise on your Mac.

The frog sits on a guitar amp: the head holds the controls, and the cabinet is the screen. The screen shows the chords
bar by bar, each as wide as it lasts, so you can see when the changes come; the key centre sits above them and lights
up when it changes. The frog dances in time with Live's tempo and dresses for the genre you pick (Kevin's outfits:
jazz, rock, country and electronic; pop and all styles keep the classic frog with its keyboard).

A weirdness knob and a genre picker reshape both. Weird means colourful (borrowed chords like ♭VI and ♭VII, secondary dominants), not lost: the frog stays in your key. With **Copy my rhythm** on, the frog answers in the rhythm and dynamics you played (strike positions, lengths, re-strikes and velocities); otherwise it plays one chord per bar, following your overall dynamics. To keep a jam, record it in Live: see [Recording a jam](ableton/SETUP.md#recording-a-jam).

> Status: feature-complete for the demo. Bridge: Max for Live (Frog Ear + Frog Voice). Models: a GRU (default) and an n-gram, switchable in ⚙ Settings.

## Repo layout (one lane per folder)

| Folder | Lane |
| --- | --- |
| `app/` | Electron overlay. Shared interfaces live in `app/src/core`. |
| `model/` | Python data prep and training, plus exported model files. |
| `ableton/` | Max for Live devices and [`ableton/SETUP.md`](ableton/SETUP.md). |

Teammates: see [`TEAMWORK.md`](TEAMWORK.md) for the lanes, contracts, milestones and git rules.

## Setup

Requires macOS, Node 20+, and Ableton Live 12.

```sh
cd app
npm install
npm run dev     # Vite dev server + Electron overlay
npm test        # unit tests (vitest)
npm start       # production build, then run it
```

Then connect Ableton by following [`ableton/SETUP.md`](ableton/SETUP.md).

**Jam report with Gemini (optional):** create `app/.env.local` (git-ignored; never commit it) containing

```sh
GEMINI_API_KEY=your-key-here
# GEMINI_MODEL=gemini-flash-lite-latest   (the default; about 1,200 tokens per report)
```

and restart the app. Without it (or with **⚙ Settings → Jam report → On this Mac only**) the report is written locally.

**Hackathon showcase page:** from `app/`, run `npm run site` to preview the standalone project page.

**Listening test** (n-gram vs GRU): in the running app, **Jam Frog → Listening test…** (Cmd+Shift+L). Each row plays a
progression and then answer A or B on the frog track; the models are hidden and shuffled. Vote, then **Reveal**.

## What leaves your machine

Nothing, unless you turn on the Gemini jam report. Then, once per jam, when you press Stop: the jam's chord names, Roman
numerals, bar numbers, key and tempo go to Google's Gemini API to write the report. No audio, no MIDI notes or timing
beyond bar numbers, nothing about you. Without an API key, or with **Jam report → On this Mac only**, nothing leaves.

- Jam Frog has no login, no analytics, no cookies, and keeps no persistent storage.
- MIDI travels only between Ableton and the app on your own Mac, over UDP on `127.0.0.1` (localhost), through the Max for Live devices.
- The chord models ship inside the app and run locally; no notes are sent to any server. The app asks for no browser permissions.
- The Gemini API key stays in the app's main process (read from `app/.env.local`); the page never sees it.
- Jam Frog writes no files. To keep what you played, record it in Live.

## Credits

- Chord data: [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (`ailsntua/Chordonomicon` on Hugging Face), licensed CC BY-NC 4.0. Kantarelis et al., *Chordonomicon: A Dataset of 666,000 Songs and their Chord Progressions*, arXiv:2410.22046, 2024.
