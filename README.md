# Jam Frog 🐸

A real-time jam partner for Ableton Live Suite 12 (Hacklanta 2026, Adobe Creative track).

You play chords in Ableton. A frog overlay floats above Live and:

1. **Suggests** the top 3 next chords every time it recognises one, with a mini keyboard for each.
2. **Answers** (toggle): when you pause, it plays a 2–4 chord continuation on its own track.

A weirdness knob and a genre picker reshape both. With **Copy my rhythm** on, the frog answers in the rhythm and dynamics you played (strike positions, lengths, re-strikes and velocities); otherwise it plays one chord per bar, following your overall dynamics. To keep a jam, record it in Live: see [Recording a jam](ableton/SETUP.md#recording-a-jam).

> Status: live suggestions, call-and-response frog answers (4 or 8 bar phrases, on Live's bar lines, in your register) work over both bridges. The overlay is Kevin's animated frog-on-an-amp UI; a Model picker switches between the n-gram and Katie's GRU. The listening test compares the two models blind.

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

**Hackathon showcase page:** from `app/`, run `npm run site` to preview the standalone project page.

**Listening test** (n-gram vs GRU): in the running app, **Jam Frog → Listening test…** (Cmd+Shift+L). Each row plays a
progression and then answer A or B on the frog track; the models are hidden and shuffled. Vote, then **Reveal**.

## What leaves your machine

Nothing.

- Jam Frog has no login, no analytics, no cookies, and keeps no persistent storage.
- MIDI travels only between Ableton and the app on your own Mac: through the IAC Driver virtual ports, or over UDP on `127.0.0.1` (localhost) for the Max for Live devices.
- The chord models ship inside the app and run locally; no notes are sent to any server.
- Jam Frog writes no files. To keep what you played, record it in Live.

## Credits

- Chord data: [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (`ailsntua/Chordonomicon` on Hugging Face), licensed CC BY-NC 4.0. Kantarelis et al., *Chordonomicon: A Dataset of 666,000 Songs and their Chord Progressions*, arXiv:2410.22046, 2024.
