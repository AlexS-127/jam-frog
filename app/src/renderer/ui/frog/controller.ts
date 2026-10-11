import type { FrogMood } from '../../../core/types';
import {
  ATLAS_HEIGHT, ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT, KEYBOARD_ATLAS_WIDTH,
  KEYBOARD_FRAMES, SPRITE_FRAMES,
} from './atlas';
import {
  ACTIONS, ART_SCALE, DRAG_THRESHOLD, PET_SIZE, STOP_SPEED,
  centeredPosition, clampPosition, frameAt, movementBounds, releaseVelocity, restingAction, stepFling, syncedFrame,
  type Action, type DragSample, type Point,
} from './motion';
import { drawOutfit, OUTFIT_SHEET, type Look } from './looks';

export interface PetSnapshot {
  action: Action;
  frame: number;
  position: Point;
  interaction: 'resting' | 'dragging' | 'flinging' | 'reacting';
  loaded: boolean;
  reducedMotion: boolean;
}

export interface PetController {
  setMood(mood: FrogMood): void;
  setMusicPlaying(playing: boolean): void;
  /** dance in time: looping actions follow this beat grid (anchor: a bar line, in performance.now ms) */
  setTempo(tempo: { anchor: number; beatMs: number } | null): void;
  /** dress the frog: 'classic', or a genre outfit (see looks.ts) */
  setLook(look: Look): void;
  preview(action: Action | null): void;
  setAmbientEnabled(enabled: boolean): void;
  resetPosition(): void;
  subscribe(listener: (state: PetSnapshot) => void): () => void;
  destroy(): void;
}

export interface PetControllerOptions {
  /** Display scale for layouts that need the pet to share space with overlay controls. */
  scale?: number;
  initialPosition?: Point;
  /** false: the frog stays where it is placed (no drag, fling or click reactions); it still animates */
  interactive?: boolean;
}

const AMBIENT: Action[] = ['idle', 'idle', 'idle', 'idle', 'waiting', 'waving', 'jumping', 'review', 'idle'];

export function createFrogPet(stage: HTMLElement, options: PetControllerOptions = {}): PetController {
  const scale = Math.max(0.25, Math.min(options.scale ?? 1, 1));
  const displaySize = { width: PET_SIZE.width * scale, height: PET_SIZE.height * scale };
  const abort = new AbortController();
  const signal = abort.signal;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'jf-pet';
  button.style.width = `${displaySize.width}px`;
  button.style.height = `${displaySize.height}px`;
  button.setAttribute('aria-label', 'Jam Frog. Click to wave or jump; drag to move.');
  const canvas = document.createElement('canvas');
  canvas.width = PET_SIZE.width;
  canvas.height = PET_SIZE.height;
  canvas.style.width = `${displaySize.width}px`;
  canvas.style.height = `${displaySize.height}px`;
  canvas.setAttribute('aria-hidden', 'true');
  button.append(canvas);
  stage.append(button);
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = false;

  const notice = document.createElement('span');
  notice.className = 'jf-pet-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = 'Loading frog…';
  stage.append(notice);

  const measure = () => ({ width: stage.clientWidth, height: stage.clientHeight });
  let bounds = movementBounds(measure(), displaySize);
  let position = centeredPosition(measure(), displaySize);
  if (options.initialPosition) position = clampPosition(options.initialPosition, bounds);
  let velocity: Point = { x: 0, y: 0 };
  let fling = false;
  let mood: FrogMood = 'idle';
  let musicPlaying = false;
  let tempo: { anchor: number; beatMs: number } | null = null;
  let look: Look = 'classic';
  let previewAction: Action | null = null;
  let currentAction: Action = 'idle';
  let actionStarted = 0;
  let clock = 0;
  let previousTime: number | null = null;
  let raf: number | null = null;
  let loaded = false;
  let disposed = false;
  let lastFrame = -1;
  let ambientEnabled = true;
  let ambientIndex = 0;
  let nextAmbient = 1700;
  let ambient: { action: Action; until: number } | null = null;
  let reaction: { action: Action; until: number } | null = null;
  let nextReaction: Action = 'waving';
  let pendingWeird = false;
  let drag: { id: number; start: Point; origin: Point; moved: boolean; action: Action; samples: DragSample[] } | null = null;
  const listeners = new Set<(snapshot: PetSnapshot) => void>();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  const images = { main: new Image(), playing: new Image(), outfits: new Image() };
  const loadedAssets = { main: false, playing: false, outfits: false };

  const busy = () => drag !== null || fling || reaction !== null;
  const rescheduleAmbient = () => { nextAmbient = clock + 1700 + Math.random() * 1300; };

  function snapshot(): PetSnapshot {
    return {
      action: currentAction, frame: Math.max(0, lastFrame), position: { ...position }, loaded, reducedMotion,
      interaction: drag ? 'dragging' : fling ? 'flinging' : reaction ? 'reacting' : 'resting',
    };
  }

  function draw(): void {
    const action = drag?.action ?? (fling ? 'idle' : null)
      ?? reaction?.action ?? previewAction ?? (musicPlaying ? 'playing' : null)
      ?? (mood === 'idle' ? ambient?.action : null) ?? restingAction(mood);
    if (action !== currentAction) {
      currentAction = action;
      actionStarted = clock;
      lastFrame = -1;
    }
    const looping = reaction === null && ambient === null && drag === null && !fling;
    const frame = reducedMotion ? 0
      : looping && tempo ? syncedFrame(action, performance.now(), tempo.anchor, tempo.beatMs)
        : frameAt(action, clock - actionStarted, looping);
    if (loaded && look !== 'classic' && loadedAssets.outfits) {
      // an outfit: the whole sprite moves (and plays its own instrument)
      if (frame !== lastFrame) drawOutfit(context, images.outfits, look, action, frame);
    } else if (loaded && (action !== 'playing' || loadedAssets.playing) && frame !== lastFrame) {
      const source = action === 'playing' ? KEYBOARD_FRAMES[frame] : SPRITE_FRAMES[ACTIONS[action].row][frame];
      const image = action === 'playing' ? images.playing : images.main;
      const artScale = action === 'playing' ? 0.43 : ART_SCALE;
      const width = Math.round(source.width * artScale);
      const height = Math.round(source.height * artScale);
      const x = Math.round((PET_SIZE.width - width) / 2);
      const y = Math.round(PET_SIZE.height - 12 - height - source.lift * artScale);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
    }
    lastFrame = frame;
    button.style.transform = `translate(${position.x}px, ${position.y}px)`;
    button.dataset.action = action;
    button.dataset.frame = String(frame);
    button.dataset.x = position.x.toFixed(2);
    button.dataset.y = position.y.toFixed(2);
    button.dataset.interaction = snapshot().interaction;
    for (const listener of listeners) listener(snapshot());
  }

  function startReaction(action: Action): void {
    reaction = { action, until: clock + ACTIONS[action].duration };
    ambient = null;
    currentAction = action;
    actionStarted = clock;
    lastFrame = -1;
    rescheduleAmbient();
    draw();
  }

  function react(): void {
    fling = false;
    velocity = { x: 0, y: 0 };
    startReaction(nextReaction);
    nextReaction = nextReaction === 'waving' ? 'jumping' : 'waving';
  }

  function tick(time: number): void {
    raf = null;
    if (disposed || document.hidden) return;
    const dt = previousTime === null ? 0 : Math.min(time - previousTime, 64);
    previousTime = time;
    clock += dt;
    if (reaction && clock >= reaction.until) reaction = null;
    if (ambient && clock >= ambient.until) ambient = null;
    if (fling) {
      const next = stepFling(position, velocity, dt, bounds);
      position = next.position;
      velocity = next.velocity;
      fling = next.moving;
      if (!fling) rescheduleAmbient();
    }
    if (!busy() && pendingWeird && previewAction === null) {
      pendingWeird = false;
      startReaction('jumping');
    }
    if (loaded && !busy() && mood === 'idle' && previewAction === null && ambientEnabled && !reducedMotion && clock >= nextAmbient) {
      const action = AMBIENT[ambientIndex++ % AMBIENT.length];
      ambient = action === 'idle' ? null : { action, until: clock + ACTIONS[action].duration };
      rescheduleAmbient();
    }
    draw();
    raf = window.requestAnimationFrame(tick);
  }

  function resume(): void {
    if (!disposed && !document.hidden && raf === null) {
      previousTime = null;
      raf = window.requestAnimationFrame(tick);
    }
  }

  for (const [asset, image] of Object.entries(images) as [keyof typeof images, HTMLImageElement][]) {
    image.addEventListener('load', () => {
      const dimensions = asset === 'playing'
        ? [KEYBOARD_ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT]
        : asset === 'outfits' ? [OUTFIT_SHEET.width, OUTFIT_SHEET.height] : [ATLAS_WIDTH, ATLAS_HEIGHT];
      if (image.naturalWidth !== dimensions[0] || image.naturalHeight !== dimensions[1]) {
        notice.textContent = 'Frog artwork dimensions do not match its frame map.';
        console.warn('[frog_sprite] Atlas dimensions do not match frame metadata.');
        return;
      }
      loadedAssets[asset] = true;
      if (asset === 'main' || loadedAssets.playing) {
        loaded = true;
        notice.remove();
      }
      lastFrame = -1;
      draw();
    }, { signal });
    image.addEventListener('error', () => {
      if (asset === 'main') notice.textContent = 'Frog artwork could not load. Reload the preview to retry.';
      console.warn(`[frog_sprite] Could not load the local ${asset} atlas.`);
    }, { signal });
  }
  images.main.src = new URL('./green-frog.png', import.meta.url).href;
  images.playing.src = new URL('./keyboard-frog.png', import.meta.url).href;
  images.outfits.src = new URL('./genre-outfits.png', import.meta.url).href;

  const interactive = options.interactive ?? true;
  if (!interactive) {
    button.tabIndex = -1;
    button.style.pointerEvents = 'none';
    button.setAttribute('aria-label', 'Jam Frog');
  }

  if (interactive) button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || !loaded || drag) return;
    event.preventDefault();
    button.focus({ preventScroll: true });
    button.setPointerCapture(event.pointerId);
    fling = false;
    velocity = { x: 0, y: 0 };
    reaction = null;
    ambient = null;
    drag = {
      id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { ...position },
      moved: false, action: 'idle',
      samples: [{ ...position, time: event.timeStamp }],
    };
    draw();
  }, { signal });

  button.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.start.x;
    const dy = event.clientY - drag.start.y;
    if (Math.hypot(dx, dy) > DRAG_THRESHOLD) drag.moved = true;
    if (!drag.moved) return;
    position = clampPosition({ x: drag.origin.x + dx, y: drag.origin.y + dy }, bounds);
    drag.samples.push({ ...position, time: event.timeStamp });
    drag.samples = drag.samples.filter((sample) => event.timeStamp - sample.time <= 80).slice(-4);
    draw();
  }, { signal });

  function endDrag(event: PointerEvent, cancelled: boolean): void {
    if (!drag || event.pointerId !== drag.id) return;
    const completed = drag;
    drag = null;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    if (!cancelled && !completed.moved) react();
    else if (!cancelled && !reducedMotion) {
      velocity = releaseVelocity(completed.samples, event.timeStamp);
      fling = Math.abs(velocity.x) >= STOP_SPEED || Math.abs(velocity.y) >= STOP_SPEED;
    }
    rescheduleAmbient();
    draw();
  }

  button.addEventListener('pointerup', (event) => endDrag(event, false), { signal });
  button.addEventListener('pointercancel', (event) => endDrag(event, true), { signal });
  button.addEventListener('lostpointercapture', (event) => endDrag(event, true), { signal });
  button.addEventListener('click', (event) => {
    // Pointer clicks react on pointerup; native Enter/Space activation has detail 0.
    if (event.detail === 0 && loaded) react();
  }, { signal });

  const observer = new ResizeObserver(() => {
    bounds = movementBounds(measure(), displaySize);
    position = options.initialPosition ? clampPosition(options.initialPosition, bounds) : clampPosition(position, bounds);
    draw();
  });
  observer.observe(stage);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && raf !== null) {
      window.cancelAnimationFrame(raf);
      raf = null;
      previousTime = null;
      if (drag) {
        const id = drag.id;
        drag = null;
        if (button.hasPointerCapture(id)) button.releasePointerCapture(id);
      }
      fling = false;
    } else resume();
  }, { signal });
  media.addEventListener('change', () => {
    reducedMotion = media.matches;
    if (reducedMotion) { fling = false; ambient = null; }
    lastFrame = -1;
    rescheduleAmbient();
    draw();
  }, { signal });

  draw();
  resume();

  return {
    setMood(nextMood) {
      if (disposed || nextMood === mood) return;
      mood = nextMood;
      pendingWeird = mood === 'weird';
      ambient = null;
      rescheduleAmbient();
      draw();
    },
    setMusicPlaying(playing) {
      if (disposed || playing === musicPlaying) return;
      musicPlaying = playing;
      lastFrame = -1;
      draw();
    },
    setLook(next) {
      if (disposed || next === look) return;
      look = next;
      lastFrame = -1;
      draw();
    },
    setTempo(next) {
      if (disposed) return;
      if (next && !(next.beatMs > 0 && Number.isFinite(next.anchor))) next = null;
      tempo = next;
    },
    preview(action) {
      if (disposed) return;
      previewAction = action;
      ambient = null;
      reaction = null;
      pendingWeird = false;
      actionStarted = clock;
      lastFrame = -1;
      rescheduleAmbient();
      draw();
    },
    setAmbientEnabled(enabled) {
      ambientEnabled = enabled;
      ambient = null;
      rescheduleAmbient();
      if (!disposed) draw();
    },
    resetPosition() {
      if (disposed) return;
      const pointerId = drag?.id;
      drag = null;
      if (pointerId !== undefined && button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      fling = false;
      reaction = null;
      velocity = { x: 0, y: 0 };
      position = centeredPosition(measure(), displaySize);
      draw();
    },
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      listener(snapshot());
      return () => { listeners.delete(listener); };
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      abort.abort();
      observer.disconnect();
      if (raf !== null) window.cancelAnimationFrame(raf);
      listeners.clear();
      button.remove();
      notice.remove();
    },
  };
}
