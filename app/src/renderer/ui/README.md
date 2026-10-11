# Sprite prototype

From `app/`, run `npm exec vite -- --host 127.0.0.1`, then open:

- [Interactive demo](http://127.0.0.1:5173/ui/demo.html)
- [All animation frames](http://127.0.0.1:5173/ui/frog/review.html)

The demo mounts the same `createOverlay(root, handlers)` component intended for later integration. It retains `UiState`, `Handlers`, and `update(state)`; `pet` and `destroy()` are additive. Call `destroy()` when unmounting. The root must have a defined size, normally 360×480. Import `overlay.css` for the transparent stage (the app does this in `src/renderer/index.html`). Demo background and development controls live outside the stage.

Select any action to preview its loop, including **Playing keyboard**. **Ambient / auto** follows the music mood; at rest the frog breathes with its eyes open, blinks every few seconds, and every 2.5–5 s does something cute (jumps, looks around, touches its chin, sticks its tongue out, or waves). Changing the mood returns to automatic mode. Click or press Enter/Space on the frog to alternate wave and jump; drag more than four pixels to move, then release to toss. **Center frog** stops motion and resets its position. The **Play a frog answer** toggle shows the dedicated keyboard performance loop; clicks briefly play a greeting before it resumes.

Reduced motion freezes the displayed pose and disables ambient gestures and fling physics. Direct dragging and explicit reactions remain available. Hidden pages pause animation time; returning resumes the previous frame without catching up.

The Electron app (`src/renderer/main.ts`) mounts this overlay and drives it from the engine. This browser demo does not move the application window and does not connect to MIDI or OSC. The current Vite configuration builds both the main entry and the standalone demo; the frame review page is served by the development server.

The overlay (440×700) has no background of its own: the frog sits on a guitar amp whose head holds the controls
(logo plate, ⚙, ×, then the control panel) and whose cabinet front is the screen, set in grille cloth. The frog wears
the genre's outfit (`frog/looks.ts`, with eight-frame idle and eight-frame performance sheets in `frog/sprites/a/genres/`). Before that, it was laid
out as Alex asked on Saturday night: a display in up to three rows, bar by bar: **your chords** on top (empty bars
until you play), **the frog's** underneath (what it plays, or with the frog Off, its suggestions, re-planned with every
chord), and in Jam mode its next block in blue (a box per bar, each chord as wide as it lasts and shrunk to fit, a
dotted stretch where a chord is held over; the sounding chord lit), the
key centre (it flashes on a key change), bar dots for the phrase, the frog sitting fixed on the amp
(no dragging; it still animates and changes mood), a translucent speech box beside it, with a tail at its bottom left, suggesting the next chords (after a jam: its report's summary and a
**Full report** button; 📋 in the header reopens it), the frog's loops in time with the tempo (`pet.setTempo`), and the amp's controls:
weirdness knob (drag up/down from where you press), genre, phrase length (2/4/8 bars), FROG Off / Answer / Jam,
and **↺ Reset** on the screen (start again; ending a jam, the frog gives its report). Chord names (letters or Roman
numerals), Copy my rhythm, the user chain's Ample setting, the model and the fallback BPM are in the ⚙ settings panel.
No mini keyboards.

## Files

- `overlay.ts`: shared UI contract and music mood mapping; high weirdness or a borrowed suggestion enters the weird mood without drawing suggestion cards.
- `frog/controller.ts`: canvas animation, gesture scheduling, pointer capture, visibility, reduced motion, and cleanup.
- `frog/motion.ts`: the available clip definitions, frame selection, bounds, and fling calculations.
- `frog/atlas.ts`: source rectangles and jump lift; fixed scale and resting foot anchor.
- `frog/sprites/`: all the frog artwork, one folder per version (the app shows `a/`). See `frog/sprites/README.md`.
- `frog/sprites/a/green-frog.png` and `keyboard-frog.png`: original generated prototype artwork.
- `shared/genre-animations.ts` and `frog/sprites/a/genres/`: measured crops and complete genre sprites used by both the app and showcase.
- `frog/artwork.md`: generation prompt, provenance, and references.
- `frog/*.test.ts`: controller events/lifecycle and pure frame/movement tests using the existing Vitest setup.

Katie can replace the PNGs and frame rectangles later. Update atlas dimensions, clip frame counts/durations, and any intended jump lift together; keep every rendered frame inside `PET_SIZE`. The frame review page exposes transparency and alignment against a checkerboard.

## Verification

Run `npm run typecheck` and `npm test` from `app/`. Controller tests use a small browser boundary stub; real pointer capture, click, keyboard activation, rendering, stage dimensions, and all used artwork frames were also checked in the browser. OS reduced-motion and hidden-tab timing are covered by simulated controller events.
