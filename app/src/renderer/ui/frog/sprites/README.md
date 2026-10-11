# Frog sprites

All the frog's artwork. The app and the showcase site use `a/`. There is no picker in the app any more; the
loading code still takes other versions, for a future A/B test.

| File | What it is |
| --- | --- |
| `green-frog.png` | the classic frog: 8 × 9 atlas (idle, wave, jump, sad, look around, thinking…), 1182 × 1330 |
| `keyboard-frog.png` | the classic frog at its keyboard: 6 frames in a row, 2172 × 724 |
| `genres/<genre>.png` | a genre outfit (jazz, rock, punk, pop, country, electronic, alternative): 4 × 4 frames, 0-7 idle, 8-15 playing |

## Adding a version for an A/B test

1. Put PNGs in `b/` (or any new folder name), with the **same file names and frame layout** as `a/`. A sheet can
   be another resolution (e.g. pixel-snapped down to the art's real pixels): the frame positions, measured once in
   `../atlas.ts` (classic frog) and `shared/genre-animations.ts` (genres), are scaled to it. Its proportions must
   stay within 10% of `a/`'s, or it falls back to `a/`'s (the console says which); art moved elsewhere in the sheet
   gets cut off.
2. You only need the files you want to change: anything missing from `b/` comes from `a/`.
3. Load it with `pet.setSprites('b')` on the frog controller (`frog/controller.ts`), e.g. from a temporary picker.

Each genre sheet's idle frames are, in order: neutral, glance right, glance left, side-eye, eyes shut, then three
neutral. The app relies on that order (eyes shut is the blink; see `OUTFIT_FRAMES` in `../looks.ts`).
