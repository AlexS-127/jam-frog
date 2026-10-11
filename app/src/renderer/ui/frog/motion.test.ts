import { describe, expect, it } from 'vitest';
import { ATLAS_HEIGHT, ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT, KEYBOARD_ATLAS_WIDTH, KEYBOARD_FRAMES, SPRITE_FRAMES } from './atlas';
import {
  ACTIONS, ART_SCALE, PET_SIZE, atlasCell, beatsPerLoop, centeredPosition, clampPosition, frameAt,
  movementBounds, releaseVelocity, restingAction, stepFling, syncedFrame, type Action,
} from './motion';
import { lookFor, OUTFIT_MOVES, OUTFIT_SHEETS, outfitScale } from './looks';
import { GENRE_ANIMATIONS, GENRE_FRAME_COUNT, GENRE_LOOKS, genreFrame } from '../../../../../shared/genre-animations';

describe('frog sprite frames', () => {
  for (const action of Object.keys(ACTIONS) as Action[]) {
    it(`${action} selects frames and fits the canvas`, () => {
      const clip = ACTIONS[action];
      expect(frameAt(action, -1)).toBe(0);
      expect(frameAt(action, clip.duration - 0.01)).toBe(clip.frames - 1);
      expect(frameAt(action, clip.duration)).toBe(0);
      expect(frameAt(action, clip.duration * 3, false)).toBe(clip.frames - 1);
      for (let i = 0; i < clip.frames; i++) {
        expect(frameAt(action, (i + 0.5) * clip.duration / clip.frames)).toBe(i);
        const frame = action === 'playing' ? KEYBOARD_FRAMES[i] : SPRITE_FRAMES[clip.row][atlasCell(action, i)];
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(action === 'playing' ? KEYBOARD_ATLAS_WIDTH : ATLAS_WIDTH);
        expect(frame.y + frame.height).toBeLessThanOrEqual(action === 'playing' ? KEYBOARD_ATLAS_HEIGHT : ATLAS_HEIGHT);
        const scale = action === 'playing' ? 0.43 : ART_SCALE;
        expect(frame.width * scale).toBeLessThanOrEqual(PET_SIZE.width);
        expect((frame.height + frame.lift) * scale + 12).toBeLessThanOrEqual(PET_SIZE.height);
      }
    });
  }
  it('idles with its eyes open: the eyes-shut cells are only for blinking', () => {
    const shut = [1, 3, 6]; // cells of the idle row with the eyes closed
    for (let i = 0; i < ACTIONS.idle.frames; i++) expect(shut).not.toContain(atlasCell('idle', i));
    expect(shut).toContain(atlasCell('blink', 0));
  });
  it('maps music moods to resting actions', () => {
    expect(['idle', 'listening', 'thinking', 'weird'].map((mood) => restingAction(mood as Parameters<typeof restingAction>[0])))
      .toEqual(['idle', 'waiting', 'review', 'idle']);
  });
});

describe('frog movement', () => {
  const bounds = movementBounds({ width: 360, height: 480 });
  it('keeps the complete frame inside a 12 pixel margin', () => {
    expect(bounds).toEqual({ minX: 12, maxX: 156, minY: 12, maxY: 252 });
    expect(clampPosition({ x: -900, y: 900 }, bounds)).toEqual({ x: 12, y: 252 });
    const center = centeredPosition({ width: 360, height: 480 });
    expect(center.x).toBe(84);
    expect(clampPosition(center, bounds)).toEqual(center);
  });
  it('pins axes when a stage cannot accommodate movement', () => {
    const small = movementBounds({ width: 200, height: 220 });
    expect(small).toEqual({ minX: 4, maxX: 4, minY: 2, maxY: 2 });
    expect(stepFling({ x: 4, y: 2 }, { x: 1, y: 1 }, 16, small).moving).toBe(false);
  });
  it('estimates recent velocity and caps a fast toss', () => {
    expect(releaseVelocity([{ x: 10, y: 10, time: 0 }, { x: 30, y: 0, time: 40 }], 50)).toEqual({ x: 0.5, y: -0.25 });
    expect(releaseVelocity([{ x: 0, y: 0, time: 0 }, { x: 900, y: -900, time: 1 }], 2)).toEqual({ x: 1.5, y: -1.5 });
    expect(releaseVelocity([{ x: 0, y: 0, time: 0 }, { x: 30, y: 0, time: 40 }], 200)).toEqual({ x: 0, y: 0 });
    expect(releaseVelocity([{ x: 0, y: 0, time: 0 }], 0)).toEqual({ x: 0, y: 0 });
  });
  it('dampens and reverses each velocity at an edge', () => {
    const next = stepFling({ x: 156, y: 12 }, { x: 1, y: -1 }, 16, bounds);
    expect(next.position).toEqual({ x: 156, y: 12 });
    expect(next.velocity.x).toBeLessThan(0);
    expect(next.velocity.y).toBeGreaterThan(0);
    expect(Math.abs(next.velocity.x)).toBeLessThan(0.5);
  });
  it('converges to rest and never leaves the stage', () => {
    let state = { position: { x: 84, y: 120 }, velocity: { x: 1.5, y: -1.5 }, moving: true };
    for (let i = 0; i < 400; i++) {
      state = stepFling(state.position, state.velocity, 16, bounds);
      expect(clampPosition(state.position, bounds)).toEqual(state.position);
    }
    expect(state.moving).toBe(false);
    expect(state.velocity).toEqual({ x: 0, y: 0 });
  });
});

describe('dancing in time', () => {
  it('fits each loop to 1, 2, 4 or 8 beats, nearest its natural length', () => {
    expect(beatsPerLoop('idle', 500)).toBe(8); // 3200 ms loop at 120 BPM: 8 beats
    expect(beatsPerLoop('idle', 1000)).toBe(4); // 60 BPM
    expect(beatsPerLoop('playing', 500)).toBe(4); // 2000 ms at 120 BPM
    expect(beatsPerLoop('playing', 300)).toBe(8); // 200 BPM
    expect(beatsPerLoop('blink', 500)).toBe(1);
  });
  it('restarts each loop on the beat grid, whenever it is drawn', () => {
    const beat = 500;
    const anchor = 12345;
    expect(syncedFrame('idle', anchor, anchor, beat)).toBe(0);
    expect(syncedFrame('idle', anchor + 8 * beat, anchor, beat)).toBe(0); // the next loop starts on beat 9
    expect(syncedFrame('idle', anchor + 4 * beat, anchor, beat)).toBe(2); // halfway through 4 frames
    expect(syncedFrame('idle', anchor - 4 * beat, anchor, beat)).toBe(2); // before the anchor too
  });
});

describe('genre outfits', () => {
  it('dresses the frog for its genre, the classic frog otherwise', () => {
    expect(['jazz', 'soul', 'rock', 'alternative', 'punk', 'metal', 'country', 'electronic', 'rap', 'pop', 'all'].map(lookFor))
      .toEqual(['jazz', 'jazz', 'rock', 'alternative', 'punk', 'punk', 'country', 'electronic', 'classic', 'pop', 'classic']);
  });
  it('maps every idle and instrument-playing frame into its own sheet and fits the canvas', () => {
    for (const action of ['waving', 'jumping', 'failed', 'review'] as const) {
      expect(OUTFIT_MOVES[action]).toHaveLength(ACTIONS[action].frames);
    }
    for (const look of GENRE_LOOKS) {
      const sheet = OUTFIT_SHEETS[look];
      const s = outfitScale(look);
      expect(sheet).toEqual(GENRE_ANIMATIONS[look]);
      for (let index = 0; index < GENRE_FRAME_COUNT * 2; index += 1) {
        const frame = genreFrame(look, index);
        expect(frame.x).toBeGreaterThanOrEqual(0);
        expect(frame.y).toBeGreaterThanOrEqual(0);
        expect(frame.x + frame.width).toBeLessThanOrEqual(sheet.width);
        expect(frame.y + frame.height).toBeLessThanOrEqual(sheet.height);
        expect(frame.width * s * 1.03 + 4).toBeLessThanOrEqual(PET_SIZE.width);
        expect(frame.height * s * 1.03 + 30).toBeLessThanOrEqual(PET_SIZE.height + 0.001);
      }
    }
  });
});
