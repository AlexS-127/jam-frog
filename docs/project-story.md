# Jam Frog: how we built it

Jam Frog is a musical companion for Ableton Live, built at Hacklanta 2026 by
Alex, Katie, and Kevin with AI coding assistants. It starts with a musician's
MIDI phrase and offers a next move instead of generating an entire song for them.

## From problem to prototype

1. **Connect the conversation.** Alex integrated Frog Ear and Frog Voice, two
   custom Max for Live devices. Notes, tempo, and bar timing travel over OSC on
   localhost between Live and the Electron overlay.
2. **Learn chord movement.** Katie developed the genre-conditioned GRU. The
   training pipeline also provides an n-gram baseline. Both use Chordonomicon and
   relative-root tokens so patterns transfer across keys. The shipped GRU uses
   exported JSON weights and a TypeScript inference implementation; it does not
   require a cloud API or ONNX Runtime.
3. **Make the response playable.** Suggest offers next chords; Answer responds to
   a 2-, 4-, or 8-bar phrase; Jam keeps going and previews the next block. Key-aware
   scoring, close voicings, optional rhythm/dynamics copying, and a weirdness
   control help the response fit the musician's playing. Weirdness can re-plan
   the next jam block without changing the one already sounding.
4. **Fit the musician's sound.** Six genre presets steer predictions and select
   named Instrument Rack chains in Live. All styles uses a custom `user` chain.
   Guitar genres can send Ample Guitar Detect-mode strums. An ambient synth rack
   is an example of customization, not a separate ambient classifier.
5. **Give the collaborator character.** Kevin built the visual interface, sprite
   foundation, individually animated genre performers, and original showcase.
   Later work added calmer idle motion, tempo-aware performance, genre-inspired
   pixel-art amps, chord names/Roman numerals, and shared sprite assets.
6. **Test and explain.** The blind A/B listening tool compares continuations
   without exposing model identity first. Local analysis identifies key changes,
   substitutions, and cadences. Optional Gemini reports turn a symbolic musical
   summary into readable explanations; they do not generate the live chords.
7. **Present the actual experience.** The showcase now opens on a full-height
   white seven-frog selector, with a larger All styles frog based on Alex's
   attached sprite. Frogs remain still and enlarge slightly on hover/focus.
   Navigation appears after scrolling or choosing a frog. Selection opens that
   genre's recording or a clearly labeled silent illustration. Closing art is
   loaded from `docs/art/`. Katie drew the closing thank-you illustration and
   its lettering by hand; the full white-background version is selected.

## What the evaluation means

On the same 20,000-section test sample (seed 0), the shipped GRU reached 61.5%
top-1 and 83.3% top-3 next-chord accuracy; the n-gram reached 56.2% and 79.6%.
These measure agreement with recorded progressions, not musical preference or
proof that every generated phrase sounds good. See [model results](../model/README.md).

## What was difficult

- Grouping MIDI notes struck a few milliseconds apart into one chord, including
  inversions and power chords.
- Starting responses on bar boundaries, handling interruptions/transport changes,
  and releasing notes before switching instruments.
- Balancing surprise with key, cadence, voice leading, and repetition.
- Working in parallel when only Alex had Ableton available: shared contracts,
  browser mocks, and tests made the other lanes possible.
- Merging concurrent artwork, model, UI, and playback work without breaking the
  connection between them.

## Privacy and limits

The local desktop workflow needs no Jam Frog account, tracking, profile, or
persistent session storage. Notes and inference remain on the Mac. Choose
**On this Mac only** or omit the API key to keep reports local too. The optional
Gemini mode sends Google chord names, Roman numerals, bars, keys, tempo, musical
events, and statistics. No raw MIDI notes or audio are included, but musical
context still leaves the machine in that mode.

The prototype targets macOS, Live 12 Suite, Max for Live, and MIDI chord input.
Direct audio listening, automatic MIDI-clip creation, scene-following, and Push
control are future possibilities, not shipped features. The training dataset
is CC BY-NC 4.0; a commercial path requires resolving data rights.

## What we learned

A useful musical assistant needs timing, voicing, responsiveness, and control as
much as prediction accuracy. The musician should remain the author. Shared
interfaces and mock environments let a small team build the model, app, and
artwork together. The next validation step is listening and workflow feedback
from musicians, not another unsupported accuracy claim.
