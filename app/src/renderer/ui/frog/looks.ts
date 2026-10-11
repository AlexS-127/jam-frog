import { PET_SIZE, type Action } from './motion';

// Genre outfits (Kevin's sprite sheet, genre-outfits.png, also on the showcase site): the frog dresses for the
// genre you pick. Each outfit is one baked-in sprite (frog, clothes and instrument together), animated by
// nudging, lifting and squashing the whole sprite per frame, as on the site.

export type Look = 'classic' | 'jazz' | 'rock' | 'country' | 'electronic';

export const OUTFIT_SHEET = { width: 1312, height: 1199 };

/** Where each outfit is in the sheet (its visible pixels; measured once from the sheet). */
export const OUTFITS: Record<Exclude<Look, 'classic'>, { x: number; y: number; width: number; height: number }> = {
  jazz: { x: 182, y: 144, width: 410, height: 445 },
  rock: { x: 754, y: 77, width: 495, height: 542 },
  country: { x: 174, y: 673, width: 480, height: 469 },
  electronic: { x: 687, y: 683, width: 534, height: 430 },
};

/** Which outfit each genre wears; pop and "all styles" keep the classic frog (with its keyboard). */
const GENRE_LOOKS: Record<string, Look> = {
  jazz: 'jazz', soul: 'jazz',
  rock: 'rock', 'pop rock': 'rock', alternative: 'rock', punk: 'rock', metal: 'rock',
  country: 'country',
  electronic: 'electronic', rap: 'electronic', reggae: 'electronic',
};

export function lookFor(genre: string): Look {
  return GENRE_LOOKS[genre] ?? 'classic';
}

/** Per frame of each action: [dx, dy, scaleX, scaleY] (canvas pixels), from the showcase site. */
export const OUTFIT_MOVES: Record<Action, readonly (readonly [number, number, number, number])[]> = {
  idle: [[0, 0, 1, 1], [-1, -2, 1, 1], [0, -3, 1, 1], [1, -2, 1, 1], [0, -1, 1, 1], [0, 0, 1, 1]],
  waving: [[0, 0, 1, 1], [-2, -2, 0.99, 1.01], [2, -3, 1.01, 1], [-1, -1, 0.99, 1.01]],
  jumping: [[0, 0, 1, 1], [0, -5, 0.99, 1.02], [0, -13, 1.01, 0.98], [0, -17, 0.98, 1.02], [0, -3, 1.03, 0.96]],
  failed: [[0, 0, 1, 1], [0, 1, 1.01, 0.99], [0, 3, 1.02, 0.97], [0, 4, 1.03, 0.96], [0, 4, 1.03, 0.96], [0, 3, 1.02, 0.97], [0, 1, 1.01, 0.99], [0, 0, 1, 1]],
  waiting: [[0, 0, 1, 1], [-1, -2, 1, 1], [0, -3, 1, 1], [1, -2, 1, 1], [0, -1, 1, 1], [0, 0, 1, 1]],
  review: [[0, 0, 1, 1], [1, -1, 1, 1], [2, -2, 1, 1], [1, -2, 1, 1], [-1, -1, 1, 1], [0, 0, 1, 1]],
  playing: [[0, 0, 1, 1], [0, -2, 1.01, 0.99], [1, -3, 1, 1.01], [0, -2, 1.01, 0.99], [-1, 0, 1, 1.01], [0, 0, 1, 1]],
};

/** Room left above the outfit for the highest jump frame. */
const JUMP_ROOM = 18;
const FEET = 12;

/** How big an outfit is drawn: as big as the classic frog, or smaller if its instrument wouldn't fit. */
export function outfitScale(look: Exclude<Look, 'classic'>): number {
  const o = OUTFITS[look];
  return Math.min(0.42, (PET_SIZE.width - 6) / (o.width * 1.03), (PET_SIZE.height - FEET - JUMP_ROOM) / (o.height * 1.03));
}

/** Draw one frame of an outfit, standing on the canvas floor (squashes keep the feet down). */
export function drawOutfit(context: CanvasRenderingContext2D, sheet: CanvasImageSource, look: Exclude<Look, 'classic'>, action: Action, frame: number): void {
  const o = OUTFITS[look];
  const [dx, dy, sx, sy] = OUTFIT_MOVES[action][frame % OUTFIT_MOVES[action].length];
  const scale = outfitScale(look);
  const width = Math.round(o.width * scale);
  const height = Math.round(o.height * scale);
  context.clearRect(0, 0, PET_SIZE.width, PET_SIZE.height);
  context.save();
  context.translate(PET_SIZE.width / 2 + dx, PET_SIZE.height - FEET + dy);
  context.scale(sx, sy);
  context.drawImage(sheet, o.x, o.y, o.width, o.height, -width / 2, -height, width, height);
  context.restore();
}
