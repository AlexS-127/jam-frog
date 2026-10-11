# Listening test

Lane E compares the bundled n-gram and GRU using the shared `AnswerEngine` and
`WebMidiNoteSink`. It covers C Am F G, Am F C G, D A Bm G, Em C G D, and C E7 Am F,
each at weirdness 0.1 and 0.9: 10 blind pairs, 20 continuations.

## Run with Ableton

From the repository root:

```sh
cd app
npx vite --host 127.0.0.1
```

Open `http://127.0.0.1:5173/listening.html` in a browser with Web MIDI support
(such as Chrome). If the development server is already running, use its URL.
The production build also includes `listening.html`.

1. Follow the IAC routing in [`ableton/SETUP.md`](../../../ableton/SETUP.md).
   Enable the **JamFrog Out** IAC port, enable Track for that input in Live,
   and set an instrument track's MIDI From to JamFrog Out / All Channels,
   Monitor In, output Main. No keyboard input or Max device is needed here.
2. Connect MIDI and select JamFrog Out. Choose a tempo before listening.
3. Play both A and B in each pair. Each clip plays the four context chords
   (one bar each), then the four-bar answer. The page shows the current chord
   and whether it belongs to the context or answer.
4. Vote A, B, or No preference, then advance. After all 10 votes, reveal the
   model identities, weirdness levels, and totals. Record the team's decision
   separately; votes and progress exist only in memory and reset on reload.

Keep the page visible while playing. Stop, navigation, hiding the page, or a
port change cancels playback and releases held notes. Interrupted or failed
clips do not earn listening credit. Changing tempo clears all progress and votes
so both sides are evaluated at the same tempo.

## Reproducibility and scope

Source contexts, voicings, genre (`all`), and per-pair stimulus seeds are fixed.
Only pair order and A/B model assignment are randomized per session. Generation
uses the live engine's default 48 candidates without its wall-clock cutoff, so
machine speed and cache warmth do not alter the candidate count. This evaluates
model quality; live latency still needs separate evaluation. Both models may
legitimately produce the same answer.

The page imports local model files, makes no external requests, and stores no
votes or notes persistently. It uses the existing NoteSink interface through
Web MIDI; the overlay and OSC connection are unchanged.

Automated checks cover all 20 real-model plans and NoteSink playback, deterministic
generation, timing, interruption, and MIDI send failures. **Lane E's final
acceptance still requires hearing all 20 cases through Ableton**, checking no
stuck notes after stop/disconnect, and collecting the team's votes. A recording
sink cannot verify the physical routing or audible musical quality.
