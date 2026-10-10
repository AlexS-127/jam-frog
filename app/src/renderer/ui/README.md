# Sprite prototype

From `app/`, run `npm exec vite -- --host 127.0.0.1`, then open:

- [Interactive demo](http://127.0.0.1:5173/ui/demo.html)
- [All animation frames](http://127.0.0.1:5173/ui/frog/review.html)

The demo mounts the same `createOverlay(root, handlers)` component intended for later integration. It retains `UiState`, `Handlers`, and `update(state)`; `pet` and `destroy()` are additive. Call `destroy()` when unmounting. The root must have a defined size, normally 360×480. Import `../style.css` for the transparent stage. Demo background and development controls live outside the stage.

Select any action to preview its loop, including **Playing keyboard**. **Ambient / auto** follows the music mood and occasional resting gestures. Changing the mood returns to automatic mode. Click or press Enter/Space on the frog to alternate wave and jump; drag more than four pixels to move, then release to toss. **Center frog** stops motion and resets its position. The **Play a frog answer** toggle shows the dedicated keyboard performance loop; clicks briefly play a greeting before it resumes.

Reduced motion freezes the displayed pose and disables ambient gestures and fling physics. Direct dragging and explicit reactions remain available. Hidden pages pause animation time; returning resumes the previous frame without catching up.

The Electron entry point remains the existing integration spike. This browser prototype does not move the application window and does not connect to MIDI or OSC. The current Vite configuration builds both the main entry and the standalone demo; the frame review page is served by the development server.

The overlay implements the Lane B “What to build” checklist: four music moods plus a looping playing animation, current chord and answer progress, recent trail, three mini-keyboard suggestions, an amplifier with one weirdness knob and one genre dropdown, answer/phrase/Keep controls, bridge and BPM selectors, and Live tempo/bar/status. The amp display shows next-chord suggestions while the player phrase is being recorded and the frog's answer between phrases. Dragging moves the frog in its idle pose; there are no running animations. Controls call the supplied handlers; mock state stays in the demo.

## Files

- `overlay.ts`: shared UI contract and music mood mapping; high weirdness or a borrowed suggestion enters the weird mood without drawing suggestion cards.
- `frog/controller.ts`: canvas animation, gesture scheduling, pointer capture, visibility, reduced motion, and cleanup.
- `frog/motion.ts`: the available clip definitions, frame selection, bounds, and fling calculations.
- `frog/atlas.ts`: source rectangles and jump lift; fixed scale and resting foot anchor.
- `frog/green-frog.png` and `frog/keyboard-frog.png`: original generated prototype artwork.
- `frog/artwork.md`: generation prompt, provenance, and references.
- `frog/*.test.ts`: controller events/lifecycle and pure frame/movement tests using the existing Vitest setup.

Katie can replace the PNGs and frame rectangles later. Update atlas dimensions, clip frame counts/durations, and any intended jump lift together; keep every rendered frame inside `PET_SIZE`. The frame review page exposes transparency and alignment against a checkerboard.

## Verification

Run `npm run typecheck` and `npm test` from `app/`. Controller tests use a small browser boundary stub; real pointer capture, click, keyboard activation, rendering, stage dimensions, and all used artwork frames were also checked in the browser. OS reduced-motion and hidden-tab timing are covered by simulated controller events.
