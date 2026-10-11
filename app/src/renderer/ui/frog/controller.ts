import type { FrogMood } from '../../../core/types';
import {
  ATLAS_HEIGHT, ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT, KEYBOARD_ATLAS_WIDTH,
  KEYBOARD_FRAMES, SPRITE_FRAMES,
} from './atlas';
import {
  ACTIONS, ART_SCALE, DRAG_THRESHOLD, PET_SIZE, STOP_SPEED,
  atlasCell, centeredPosition, clampPosition, frameAt, movementBounds, releaseVelocity, restingAction, stepFling, syncedFrame,
  type Action, type DragSample, type Point,
} from './motion';
import { drawOutfit, GENRE_LOOKS, OUTFIT_FRAMES, OUTFIT_SHEETS, outfitScale, type Look } from './looks';
import { DEFAULT_SPRITES, spriteUrl } from './sprites';
import { drawTongue, tonguePose } from './tongue';
import type { GenreLook } from '../../../../../shared/genre-animations';

export interface PetSnapshot {
  action: Action;
  frame: number;
  position: Point;
  mouth: Point;
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
  /** which version of the artwork to draw: a folder under sprites/ (see sprites.ts) */
  setSprites(version: string): void;
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

// At rest the frog breathes and blinks now and then, and every few seconds does something cute: jumps, looks
// around, touches its chin, sticks its tongue out, or waves.
const MOMENTS: Action[] = ['jumping', 'waiting', 'tongue', 'review', 'jumping', 'tongue', 'waiting', 'review', 'waving'];
/** rest between cute moments (ms): MOMENT_GAP plus up to MOMENT_GAP_JITTER */
const MOMENT_GAP = 2500;
const MOMENT_GAP_JITTER = 2500;
/** time between blinks (ms); one blink in five comes straight back as a double blink */
const BLINK_GAP = 2500;
const BLINK_GAP_JITTER = 3000;
const DOUBLE_BLINK_GAP = 350;
/** the classic frog's art pixel on the canvas, for the tongue */
const CLASSIC_PIXEL = 4;

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
  let mouthInCanvas: Point = { x: PET_SIZE.width / 2, y: PET_SIZE.height / 2 };
  let fling = false;
  let mood: FrogMood = 'idle';
  let musicPlaying = false;
  let tempo: { anchor: number; beatMs: number } | null = null;
  let look: Look = 'classic';
  let sprites = DEFAULT_SPRITES;
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
  let nextAmbient = MOMENT_GAP;
  let nextBlink = BLINK_GAP;
  let ambient: { action: Action; until: number } | null = null;
  let reaction: { action: Action; until: number } | null = null;
  let nextReaction: Action = 'waving';
  let pendingWeird = false;
  let drag: { id: number; start: Point; origin: Point; moved: boolean; action: Action; samples: DragSample[] } | null = null;
  const listeners = new Set<(snapshot: PetSnapshot) => void>();
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMotion = media.matches;
  const images = {
    main: new Image(), playing: new Image(),
    outfits: Object.fromEntries(GENRE_LOOKS.map((genre) => [genre, new Image()])) as Record<GenreLook, HTMLImageElement>,
  };
  const loadedAssets = {
    main: false, playing: false,
    outfits: Object.fromEntries(GENRE_LOOKS.map((genre) => [genre, false])) as Record<GenreLook, boolean>,
  };

  const busy = () => drag !== null || fling || reaction !== null;
  const rescheduleAmbient = () => {
    nextAmbient = clock + MOMENT_GAP + Math.random() * MOMENT_GAP_JITTER;
    nextBlink = clock + BLINK_GAP / 2 + Math.random() * BLINK_GAP_JITTER;
  };

  function snapshot(): PetSnapshot {
    return {
      action: currentAction, frame: Math.max(0, lastFrame), position: { ...position },
      mouth: { x: position.x + mouthInCanvas.x * scale, y: position.y + mouthInCanvas.y * scale },
      loaded, reducedMotion,
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
    const outfitReady = look !== 'classic' && loadedAssets.outfits[look];
    const frameCount = (outfitReady ? OUTFIT_FRAMES[action]?.length : undefined) ?? ACTIONS[action].frames;
    const frame = reducedMotion ? 0
      : looping && tempo ? syncedFrame(action, performance.now(), tempo.anchor, tempo.beatMs, frameCount)
        : frameAt(action, clock - actionStarted, looping, frameCount);
    const tongue = action === 'tongue' && !reducedMotion ? tonguePose(frame) : null;
    const redraw = frame !== lastFrame;
    if (loaded && look !== 'classic' && outfitReady) {
      if (redraw) {
        mouthInCanvas = drawOutfit(context, images.outfits[look], look, action, frame, sheetScales.get(images.outfits[look]));
        if (tongue) drawTongue(context, Math.round(mouthInCanvas.x), Math.round(mouthInCanvas.y), Math.max(2, Math.round(10 * outfitScale(look))), tongue);
      }
    } else if (loaded && (action !== 'playing' || loadedAssets.playing) && redraw) {
      const source = action === 'playing' ? KEYBOARD_FRAMES[frame] : SPRITE_FRAMES[ACTIONS[action].row][atlasCell(action, frame)];
      const image = action === 'playing' ? images.playing : images.main;
      const artScale = action === 'playing' ? 0.43 : ART_SCALE;
      const width = Math.round(source.width * artScale);
      const height = Math.round(source.height * artScale);
      const x = Math.round((PET_SIZE.width - width) / 2);
      const y = Math.round(PET_SIZE.height - 12 - height - source.lift * artScale);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const k = sheetScales.get(image) ?? { x: 1, y: 1 };
      context.drawImage(image, source.x * k.x, source.y * k.y, source.width * k.x, source.height * k.y, x, y, width, height);
      mouthInCanvas = { x: x + width * .5, y: y + height * (action === 'playing' ? .4 : .44) };
      if (tongue) drawTongue(context, Math.round(mouthInCanvas.x), Math.round(mouthInCanvas.y), CLASSIC_PIXEL, tongue);
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
    if (loaded && !busy() && mood === 'idle' && previewAction === null && ambientEnabled && !reducedMotion && !musicPlaying && !ambient) {
      if (clock >= nextAmbient) {
        const action = MOMENTS[ambientIndex++ % MOMENTS.length];
        ambient = { action, until: clock + ACTIONS[action].duration };
        nextAmbient = ambient.until + MOMENT_GAP + Math.random() * MOMENT_GAP_JITTER;
        nextBlink = ambient.until + BLINK_GAP / 2 + Math.random() * BLINK_GAP_JITTER;
      } else if (clock >= nextBlink) {
        ambient = { action: 'blink', until: clock + ACTIONS.blink.duration };
        nextBlink = clock + (Math.random() < 0.2 ? DOUBLE_BLINK_GAP : BLINK_GAP + Math.random() * BLINK_GAP_JITTER);
      }
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

  const files = { main: 'green-frog.png', playing: 'keyboard-frog.png' } as const;
  /** A sheet that doesn't fit its frame map: another version falls back to a/'s; a/ itself can't. */
  const fellBack = new Set<HTMLImageElement>();
  /** sheets drawn at another resolution than their frame map: the map is scaled to them */
  const sheetScales = new Map<HTMLImageElement, { x: number; y: number }>();
  /**
   * Whether a loaded sheet can be drawn with its frame map: the exact size, or (another version) the same layout
   * at another resolution, e.g. pixel-snapped to the art's real pixels; within 10% of the same proportions.
   */
  function fits(image: HTMLImageElement, width: number, height: number): boolean {
    const scale = { x: image.naturalWidth / width, y: image.naturalHeight / height };
    sheetScales.delete(image);
    if (scale.x === 1 && scale.y === 1) return true;
    if (sprites === DEFAULT_SPRITES || fellBack.has(image) || Math.abs(scale.x / scale.y - 1) > 0.1) return false;
    sheetScales.set(image, scale);
    return true;
  }
  function wrongSize(image: HTMLImageElement, file: string): boolean {
    if (sprites === DEFAULT_SPRITES || fellBack.has(image)) return false;
    fellBack.add(image);
    console.warn(`[frog_sprite] sprites/${sprites}/${file} is ${image.naturalWidth}×${image.naturalHeight}, not the proportions its frame map expects; using sprites/${DEFAULT_SPRITES}/${file}.`);
    image.src = spriteUrl(DEFAULT_SPRITES, file);
    return true;
  }
  for (const [asset, image] of [['main', images.main], ['playing', images.playing]] as const) {
    image.addEventListener('load', () => {
      const dimensions = asset === 'playing'
        ? [KEYBOARD_ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT] : [ATLAS_WIDTH, ATLAS_HEIGHT];
      if (!fits(image, dimensions[0], dimensions[1])) {
        if (wrongSize(image, files[asset])) return;
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
  for (const genre of GENRE_LOOKS) {
    const image = images.outfits[genre];
    image.addEventListener('load', () => {
      const { width, height } = OUTFIT_SHEETS[genre];
      if (!fits(image, width, height)) {
        if (wrongSize(image, `genres/${genre}.png`)) return;
        console.warn(`[frog_sprite] ${genre} outfit atlas dimensions do not match its frame map.`);
        return;
      }
      loadedAssets.outfits[genre] = true;
      lastFrame = -1;
      draw();
    }, { signal });
    image.addEventListener('error', () => console.warn(`[frog_sprite] Could not load the ${genre} outfit atlas.`), { signal });
  }
  function loadSprites(): void {
    fellBack.clear();
    images.main.src = spriteUrl(sprites, files.main);
    images.playing.src = spriteUrl(sprites, files.playing);
    for (const genre of GENRE_LOOKS) images.outfits[genre].src = spriteUrl(sprites, `genres/${genre}.png`);
  }
  loadSprites();

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
    setSprites(version) {
      if (disposed || version === sprites) return;
      sprites = version;
      loadSprites(); // each sheet redraws as it loads; until then the frog keeps the old art
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
