import { PET_SIZE, type Action, type Point } from './motion';
import {
  GENRE_ANIMATIONS, GENRE_FRAME_COUNT, GENRE_LOOKS, genreFrame, genreFrameSize,
  type GenreLook,
} from '../../../../../shared/genre-animations';

export type Look = 'classic' | GenreLook;
export { GENRE_LOOKS, GENRE_FRAME_COUNT };

/** The app and showcase share the same complete sprite frames. */
export const OUTFIT_SHEETS = GENRE_ANIMATIONS;

const GENRE_LOOKS_BY_MODEL: Record<string, Look> = {
  jazz: 'jazz', soul: 'jazz',
  rock: 'rock', 'pop rock': 'rock',
  punk: 'punk', metal: 'punk',
  alternative: 'alternative',
  pop: 'pop',
  country: 'country',
  electronic: 'electronic', reggae: 'electronic',
};

export function lookFor(genre: string): Look {
  return GENRE_LOOKS_BY_MODEL[genre] ?? 'classic';
}

/**
 * Which sheet frame each frame of an action shows, where it isn't simply 0, 1, 2…. Every sheet's idle frames are
 * 0 neutral, 1 glance right, 2 glance left, 3 side-eye, 4 eyes shut, 5-7 neutral; 8-15 play the instrument.
 * Idle breathes with its eyes open and blinks only now and then; the outfits hold their instrument, so instead of
 * touching the chin they ponder with a side-eye.
 */
export const OUTFIT_FRAMES: Partial<Record<Action, readonly number[]>> = {
  idle: [0, 7, 5, 7],
  blink: [4],
  tongue: [0, 0, 0],
  waiting: [2, 2, 0, 1, 1, 0],
  review: [3, 3, 1, 4, 3, 0],
  playing: [8, 9, 10, 11, 12, 13, 14, 15],
};

/** Actions beyond idle, blinking, the tongue, looking around and playing still move the complete character. */
export const OUTFIT_MOVES: Record<Exclude<Action, 'idle' | 'blink' | 'tongue' | 'waiting' | 'playing'>, readonly (readonly [number, number, number, number])[]> = {
  waving: [[0, 0, 1, 1], [-2, -2, 0.99, 1.01], [2, -3, 1.01, 1], [-1, -1, 0.99, 1.01]],
  jumping: [[0, 0, 1, 1], [0, -5, 0.99, 1.02], [0, -13, 1.01, 0.98], [0, -17, 0.98, 1.02], [0, -3, 1.03, 0.96]],
  failed: [[0, 0, 1, 1], [0, 1, 1.01, 0.99], [0, 3, 1.02, 0.97], [0, 4, 1.03, 0.96], [0, 4, 1.03, 0.96], [0, 3, 1.02, 0.97], [0, 1, 1.01, 0.99], [0, 0, 1, 1]],
  review: [[0, 0, 1, 1], [1, -1, 1, 1], [2, -2, 1, 1], [1, -2, 1, 1], [-1, -1, 1, 1], [0, 0, 1, 1]],
};

/** Leave room for the tallest hat or mohawk and the highest jump pose. */
export function outfitScale(look: GenreLook): number {
  const { width, height } = genreFrameSize(look);
  return Math.min(0.56, (PET_SIZE.width - 6) / (width * 1.03), (PET_SIZE.height - 30) / (height * 1.03));
}

export function drawOutfit(
  context: CanvasRenderingContext2D, sheet: CanvasImageSource,
  look: GenreLook, action: Action, frame: number,
  /** the sheet's size over the frame map's (a smaller, pixel-snapped version of the art: see sprites.ts) */
  sheetScale: { x: number; y: number } = { x: 1, y: 1 },
): Point {
  const sequence = OUTFIT_FRAMES[action];
  const index = sequence ? sequence[frame % sequence.length] : frame % GENRE_FRAME_COUNT;
  const source = genreFrame(look, index);
  const movement = action === 'idle' || action === 'blink' || action === 'tongue' || action === 'waiting' || action === 'playing'
    ? [0, 0, 1, 1] : OUTFIT_MOVES[action][frame % OUTFIT_MOVES[action].length];
  const [dx, dy, sx, sy] = movement;
  const scale = outfitScale(look);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  context.clearRect(0, 0, PET_SIZE.width, PET_SIZE.height);
  context.save();
  context.translate(PET_SIZE.width / 2 + dx, PET_SIZE.height - 12 + dy);
  context.scale(sx, sy);
  context.drawImage(sheet, source.x * sheetScale.x, source.y * sheetScale.y, source.width * sheetScale.x, source.height * sheetScale.y,
    -width / 2, -height, width, height);
  context.restore();
  const [mouthX, mouthY] = GENRE_ANIMATIONS[look].mouth;
  return {
    x: PET_SIZE.width / 2 + dx + sx * (width * (mouthX - .5)),
    y: PET_SIZE.height - 12 + dy + sy * (height * (mouthY - 1)),
  };
}
