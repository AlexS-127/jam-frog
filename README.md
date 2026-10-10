# Jam Frog 🐸

A real-time jam partner for Ableton Live Suite 12 (Hacklanta 2026, Adobe Creative track).

You play chords in Ableton. A frog overlay floats above Live and:

1. **Suggests** the top 3 next chords every time it recognises one, with a mini keyboard for each.
2. **Answers** (toggle): when you pause, it plays a 2–4 chord continuation on its own track.

A weirdness knob and a genre picker reshape both. **Keep** saves your last phrase plus the answer as a `.mid`.

> Status: live suggestions, call-and-response frog answers (4 or 8 bar phrases, on Live's bar lines, in your register) and Keep (.mid) work over both bridges. The overlay is Kevin's animated frog-on-an-amp UI; a Model picker switches between the n-gram and Katie's GRU. Next: the listening test page.

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

## What leaves your machine

Nothing.

- Jam Frog has no login, no analytics, no cookies, and keeps no persistent storage.
- MIDI travels only between Ableton and the app on your own Mac: through the IAC Driver virtual ports, or over UDP on `127.0.0.1` (localhost) for the Max for Live devices.
- The chord models ship inside the app and run locally; no notes are sent to any server.
- The only file Jam Frog writes is a `.mid` that you choose to save with **Keep**.

## Credits

- Chord data: [Chordonomicon](https://huggingface.co/datasets/ailsntua/Chordonomicon) (`ailsntua/Chordonomicon` on Hugging Face), licensed CC BY-NC 4.0. Kantarelis et al., *Chordonomicon: A Dataset of 666,000 Songs and their Chord Progressions*, arXiv:2410.22046, 2024.
