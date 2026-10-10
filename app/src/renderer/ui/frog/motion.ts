import type { FrogMood } from '../../../core/types';

export const ACTIONS = {
  idle: { label: 'Idle', row: 0, frames: 6, duration: 1100 },
  waving: { label: 'Wave', row: 3, frames: 4, duration: 700 },
  jumping: { label: 'Jump', row: 4, frames: 5, duration: 840 },
  failed: { label: 'Sad', row: 5, frames: 8, duration: 1220 },
  waiting: { label: 'Waiting', row: 6, frames: 6, duration: 1010 },
  review: { label: 'Thinking', row: 8, frames: 6, duration: 1030 },
  playing: { label: 'Playing keyboard', row: -1, frames: 6, duration: 1100 },
} as const;

export type Action = keyof typeof ACTIONS;
export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface DragSample extends Point { time: number }

// Extra transparent headroom accommodates the full jump and outstretched arms.
// A neutral frog is about 144 CSS pixels wide inside this frame.
export const PET_SIZE: Size = { width: 192, height: 216 };
export const ART_SCALE = 1.3;
export const MARGIN = 12;
export const STOP_SPEED = 0.05;
export const DRAG_THRESHOLD = 4;

export function frameAt(action: Action, elapsed: number, loop = true): number {
  const clip = ACTIONS[action];
  const frame = Math.floor(Math.max(0, elapsed) / clip.duration * clip.frames);
  return loop ? frame % clip.frames : Math.min(frame, clip.frames - 1);
}

export function movementBounds(stage: Size, pet = PET_SIZE): Bounds {
  const margin = MARGIN * pet.width / PET_SIZE.width;
  const verticalMargin = MARGIN * pet.height / PET_SIZE.height;
  const axis = (space: number, size: number, edge: number) => space >= size + 2 * edge
    ? [edge, space - size - edge]
    : [Math.max(0, (space - size) / 2), Math.max(0, (space - size) / 2)];
  const [minX, maxX] = axis(stage.width, pet.width, margin);
  const [minY, maxY] = axis(stage.height, pet.height, verticalMargin);
  return { minX, maxX, minY, maxY };
}

export function clampPosition(point: Point, bounds: Bounds): Point {
  return {
    x: Math.max(bounds.minX, Math.min(bounds.maxX, point.x)),
    y: Math.max(bounds.minY, Math.min(bounds.maxY, point.y)),
  };
}

export function centeredPosition(stage: Size, pet = PET_SIZE): Point {
  const scale = pet.width / PET_SIZE.width;
  const restingCenter = (PET_SIZE.height - 12 - 95 * ART_SCALE / 2) * scale;
  return clampPosition({ x: (stage.width - pet.width) / 2, y: stage.height / 2 - restingCenter }, movementBounds(stage, pet));
}

export function releaseVelocity(samples: readonly DragSample[], releasedAt: number): Point {
  const recent = samples.filter((sample) => releasedAt - sample.time <= 80);
  if (recent.length < 2) return { x: 0, y: 0 };
  const first = recent[0];
  const last = recent[recent.length - 1];
  const elapsed = last.time - first.time;
  if (elapsed <= 0) return { x: 0, y: 0 };
  const cap = (value: number) => Math.max(-1.5, Math.min(1.5, value));
  return { x: cap((last.x - first.x) / elapsed), y: cap((last.y - first.y) / elapsed) };
}

export function stepFling(position: Point, velocity: Point, elapsed: number, bounds: Bounds) {
  // Cap an unusually late frame to avoid teleporting across the stage.
  const dt = Math.max(0, Math.min(elapsed, 32));
  const friction = 0.92 ** (dt / (1000 / 60));
  const distance = (1 - friction) / (-Math.log(0.92) / (1000 / 60));
  const next = { x: position.x + velocity.x * distance, y: position.y + velocity.y * distance };
  const clamped = clampPosition(next, bounds);
  const nextVelocity = {
    x: velocity.x * friction * (next.x === clamped.x ? 1 : -0.5),
    y: velocity.y * friction * (next.y === clamped.y ? 1 : -0.5),
  };
  if (bounds.minX === bounds.maxX) nextVelocity.x = 0;
  if (bounds.minY === bounds.maxY) nextVelocity.y = 0;
  const moving = Math.abs(nextVelocity.x) >= STOP_SPEED || Math.abs(nextVelocity.y) >= STOP_SPEED;
  return { position: clamped, velocity: moving ? nextVelocity : { x: 0, y: 0 }, moving };
}

export function restingAction(mood: FrogMood): Action {
  return mood === 'listening' ? 'waiting' : mood === 'thinking' ? 'review' : 'idle';
}
