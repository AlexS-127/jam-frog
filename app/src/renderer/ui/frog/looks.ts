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
  rap: 'rap',
};

export function lookFor(genre: string): Look {
  return GENRE_LOOKS_BY_MODEL[genre] ?? 'classic';
}

/** Existing actions beyond idle and playing still move the complete character. */
export const OUTFIT_MOVES: Record<Exclude<Action, 'idle' | 'waiting' | 'playing'>, readonly (readonly [number, number, number, number])[]> = {
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
): Point {
  const index = action === 'playing' ? GENRE_FRAME_COUNT + frame % GENRE_FRAME_COUNT
    : frame % GENRE_FRAME_COUNT;
  const source = genreFrame(look, index);
  const movement = action === 'idle' || action === 'waiting' || action === 'playing'
    ? [0, 0, 1, 1] : OUTFIT_MOVES[action][frame % OUTFIT_MOVES[action].length];
  const [dx, dy, sx, sy] = movement;
  const scale = outfitScale(look);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  context.clearRect(0, 0, PET_SIZE.width, PET_SIZE.height);
  context.save();
  context.translate(PET_SIZE.width / 2 + dx, PET_SIZE.height - 12 + dy);
  context.scale(sx, sy);
  context.drawImage(sheet, source.x, source.y, source.width, source.height, -width / 2, -height, width, height);
  context.restore();
  const [mouthX, mouthY] = GENRE_ANIMATIONS[look].mouth;
  return {
    x: PET_SIZE.width / 2 + dx + sx * (width * (mouthX - .5)),
    y: PET_SIZE.height - 12 + dy + sy * (height * (mouthY - 1)),
  };
}
