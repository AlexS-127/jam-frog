# Prototype frog artwork

Original green frog atlas and keyboard-playing strip generated with the built-in Image Generation tool. These are temporary prototype assets; Katie can replace them with Adobe-authored art later. The PNGs are bundled locally and are never requested from a remote service by the app.

The generated image is 1182×1330 with true alpha. `atlas.ts` records measured source rectangles rather than assuming a perfect grid. Frames share a fixed drawing scale and foot anchor; the jump row preserves its authored vertical offsets.

The keyboard-playing clip is a separate 2172×724 transparent strip. Its six crops share a foot anchor and play at a scale that fits the music UI. It loops while `UiState.musicPlaying` is true; drag and click reactions briefly take priority.

Behavior and initial timings are inspired by [Petdex's state definitions](https://github.com/crafter-station/petdex/blob/main/src/lib/pet-states.ts) and [Petdex's floater interactions](https://github.com/crafter-station/petdex/blob/main/src/components/pets/pet-floater.tsx). The controller is an independent TypeScript implementation.

## Generation prompt

Create a production sprite animation atlas PNG for an original small green pixel-art pet frog. Transparent background (true alpha). EXACT grid: 8 equally wide columns x 9 equally tall rows, no margins between cells, no labels, no grid lines. Target canvas 1536 x 1728 pixels, each cell 192 x 192. All 72 cells contain exactly one entire frog fully inside that cell. Each cell uses consistent character scale: body about 110 pixels wide and 125 pixels tall, centered horizontally, resting feet at 165 pixels from cell top. Plenty of transparent clearance. Same cute character in EVERY frame: lime-green squat frog, pale cream belly, large expressive eyes with dark green outlines, darker green limbs, friendly mouth. Crisp square pixel edges, limited palette, game sprite style, no vector look, no glow, no shadows outside the body.
This sheet has nine animation rows from top to bottom:
Row 1 IDLE: first 6 cells smooth small breathing and blink cycle, cells 7-8 repeat neutral.
Row 2 RUN RIGHT: 8-frame side-facing right running/hopping cycle with legs and arms changing each frame.
Row 3 RUN LEFT: 8-frame side-facing left running/hopping cycle.
Row 4 WAVE: first 4 cells front-facing arm raises, waves, waves back, lowers; remaining 4 repeat neutral.
Row 5 JUMP: first 5 cells crouch, lift, airborne peak, descend, land; remaining 3 repeat neutral. Airborne frog stays inside its own cell. Same body size.
Row 6 SAD: 8 frames ears/eyes droop, sad expression and gentle recovery, no tears outside the cell.
Row 7 WAITING: first 6 cells front-facing looks left, center, right, center with patient expression, remaining 2 neutral.
Row 8 RUN IN PLACE: first 6 cells front-facing feet/arms alternate running, remaining 2 neutral.
Row 9 THINKING: first 6 cells front-facing hand to chin, look up, ponder, blink, ponder, relax, remaining 2 neutral.
Maintain a strict rectangular 8 by 9 atlas, visible frame-to-frame pose changes, aligned foot baseline except jump, completely separate sprites with transparent padding. No props or letters. This is original Jam Frog prototype artwork.

## Keyboard-playing prompt

Use the attached Jam Frog sprite atlas as a style and character reference only. Create one new transparent PNG strip with exactly six equally sized cells in one horizontal row. Show the same original lime-green pixel-art frog from the reference with pale cream belly, dark green pixel outline, large expressive eyes, identical palette and crisp pixel edges. Pose the frog seated at a tiny, simple dark forest-green electronic piano keyboard in front of it. Only frog and compact keyboard; no room, furniture, decoration, shadow, or glow. Center and stabilize frog and keyboard in every cell. Frame 1 hands on keys, eyes open; frame 2 presses a key and looks down; frame 3 other hand presses while eyes return; frame 4 hands depress keys with content smile; frame 5 alternates key press and gentle blink; frame 6 returns to frame 1. Move hands, eyes, and head subtly but visibly. Keep keyboard fixed. Use true alpha and keep all pixels within each frame. This is original Jam Frog prototype artwork.
