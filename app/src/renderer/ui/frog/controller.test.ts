import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFrogPet, type PetController, type PetSnapshot } from './controller';
import { OUTFIT_SHEETS } from './looks';

// Minimal browser boundary: exercise real controller scheduling and event listeners.
class ElementStub extends EventTarget {
  children: ElementStub[] = [];
  draws: unknown[][] = [];
  style: Record<string, string> = {};
  dataset: Record<string, string> = {};
  clientWidth = 360;
  clientHeight = 480;
  captured = new Set<number>();
  append(child: ElementStub) { this.children.push(child); }
  setAttribute() {}
  focus() {}
  remove() {}
  setPointerCapture(id: number) { this.captured.add(id); }
  hasPointerCapture(id: number) { return this.captured.has(id); }
  releasePointerCapture(id: number) { this.captured.delete(id); }
  getContext() { return {
    clearRect() {}, drawImage: (...args: unknown[]) => { this.draws.push(args); },
    save() {}, restore() {}, translate() {}, scale() {}, imageSmoothingEnabled: true,
  }; }
}

describe('frog controller', () => {
  let pet: PetController;
  let button: ElementStub;
  let state: PetSnapshot;
  let documentStub: EventTarget & { hidden: boolean; createElement: () => ElementStub };
  let media: EventTarget & { matches: boolean };
  let frames: Map<number, FrameRequestCallback>;
  let time: number;

  function advance(ms: number) {
    for (let remaining = ms; remaining > 0;) {
      const dt = Math.min(16, remaining);
      time += dt;
      remaining -= dt;
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(time);
    }
  }
  function event(type: string, values: Record<string, number | boolean> = {}) {
    const event = new Event(type);
    Object.defineProperties(event, Object.fromEntries(Object.entries({
      pointerId: 1, button: 0, isPrimary: true, clientX: 100, clientY: 100, timeStamp: time, ...values,
    }).map(([key, value]) => [key, { value }])));
    button.dispatchEvent(event);
  }

  beforeEach(async () => {
    frames = new Map();
    time = 0;
    let frameId = 0;
    documentStub = Object.assign(new EventTarget(), { hidden: false, createElement: () => new ElementStub() });
    media = Object.assign(new EventTarget(), { matches: false });
    vi.stubGlobal('document', documentStub);
    vi.stubGlobal('window', {
      matchMedia: () => media,
      requestAnimationFrame: (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    });
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('Image', class extends EventTarget {
      naturalWidth = 0;
      naturalHeight = 0;
      set src(value: string) {
        const genre = value.match(/genre-animations\/(\w+)\.png/)?.[1] as keyof typeof OUTFIT_SHEETS | undefined;
        this.naturalWidth = genre ? OUTFIT_SHEETS[genre].width : value.includes('keyboard-frog') ? 2172 : 1182;
        this.naturalHeight = genre ? OUTFIT_SHEETS[genre].height : value.includes('keyboard-frog') ? 724 : 1330;
        queueMicrotask(() => this.dispatchEvent(new Event('load')));
      }
    });
    const stage = new ElementStub();
    pet = createFrogPet(stage as unknown as HTMLElement);
    button = stage.children[0];
    pet.subscribe((value) => { state = value; });
    await Promise.resolve();
    advance(16);
    pet.setAmbientEnabled(false);
  });
  afterEach(() => { pet.destroy(); vi.unstubAllGlobals(); });

  it('alternates pointer and keyboard reactions then returns to rest', () => {
    event('pointerdown');
    event('pointerup');
    event('click', { detail: 1 });
    expect(state.action).toBe('waving');
    advance(720);
    expect(state.action).toBe('idle');
    event('click', { detail: 0 });
    expect(state.action).toBe('jumping');
    advance(850);
    expect(state.interaction).toBe('resting');
  });
  it('distinguishes four pixels from a drag while keeping the frog in its resting pose', () => {
    event('pointerdown');
    event('pointermove', { clientX: 104 });
    expect(state.position.x).toBe(84);
    event('pointerup');
    expect(state.action).toBe('waving');
    event('pointerdown');
    advance(16);
    event('pointermove', { clientX: 130 });
    expect(state.action).toBe('idle');
    expect(state.position.x).toBe(114);
    advance(16);
    event('pointermove', { clientX: 90 });
    expect(state.action).toBe('idle');
    event('pointermove', { clientX: -1000, clientY: 2000 });
    expect(state.position).toEqual({ x: 12, y: 252 });
  });
  it('flings on release, stays bounded, and settles', () => {
    event('pointerdown');
    advance(16);
    event('pointermove', { clientX: 125 });
    event('pointerup', { clientX: 125 });
    expect(state.interaction).toBe('flinging');
    advance(64);
    expect(state.action).toBe('idle');
    advance(4000);
    expect(state.interaction).toBe('resting');
    expect(state.position.x).toBeGreaterThanOrEqual(12);
    expect(state.position.x).toBeLessThanOrEqual(156);
  });
  it.each(['pointercancel', 'lostpointercapture'])('%s stops without a fling or click reaction', (type) => {
    event('pointerdown');
    advance(16);
    event('pointermove', { clientX: 130 });
    event(type);
    const position = state.position;
    advance(200);
    expect(state.interaction).toBe('resting');
    expect(state.position).toEqual(position);
    expect(button.captured.size).toBe(0);
  });
  it('does not restart repeated moods; weird jumps once and waits for user interaction', () => {
    pet.setMood('listening');
    advance(400);
    const frame = state.frame;
    pet.setMood('listening');
    expect(state.frame).toBe(frame);
    pet.setMood('thinking');
    expect(state.action).toBe('review');
    event('pointerdown');
    pet.setMood('weird');
    advance(16);
    expect(state.interaction).toBe('dragging');
    event('pointercancel');
    advance(16);
    expect(state.action).toBe('jumping');
    advance(900);
    pet.setMood('weird');
    advance(16);
    expect(state.action).toBe('idle');
  });
  it('keeps manual previews stable and stops ambient/fling under reduced motion', () => {
    pet.setAmbientEnabled(true);
    pet.preview('failed');
    advance(10000);
    expect(state.action).toBe('failed');
    media.matches = true;
    media.dispatchEvent(new Event('change'));
    expect(state.frame).toBe(0);
    pet.preview(null);
    advance(20000);
    expect(state.action).toBe('idle');
    event('pointerdown');
    advance(16);
    event('pointermove', { clientX: 130 });
    event('pointerup');
    expect(state.interaction).toBe('resting');
    const position = state.position;
    advance(1000);
    expect(state.position).toEqual(position);
  });
  it('loops the dedicated keyboard playing animation while music is playing', () => {
    pet.setMusicPlaying(true);
    expect(state.action).toBe('playing');
    advance(600);
    const firstLoop = state.frame;
    expect(firstLoop).toBeGreaterThan(0);
    advance(700);
    expect(state.action).toBe('playing');
    expect(state.frame).not.toBe(firstLoop);
    event('pointerdown');
    event('pointerup');
    expect(state.action).toBe('waving');
    advance(720);
    expect(state.action).toBe('playing');
    pet.setMusicPlaying(false);
    expect(state.action).toBe('idle');
  });
  it('uses all eight complete idle and playing frames for a genre instrument', () => {
    const canvas = button.children[0];
    const idleFrames = new Set<number>();
    const playingFrames = new Set<number>();
    pet.subscribe((snapshot) => {
      if (snapshot.action === 'idle') idleFrames.add(snapshot.frame);
      if (snapshot.action === 'playing') playingFrames.add(snapshot.frame);
    });
    pet.setLook('rock');
    advance(1100);
    expect([...idleFrames].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);

    const start = canvas.draws.length;
    pet.setMusicPlaying(true);
    advance(1100);
    expect([...playingFrames].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const playingDraws = canvas.draws.slice(start);
    expect(playingDraws.length).toBeGreaterThanOrEqual(8);
    expect(playingDraws.every((draw) => Number(draw[2]) >= OUTFIT_SHEETS.rock.y[2])).toBe(true);
  });
  it('pauses hidden time and removes listeners and animation scheduling on disposal', () => {
    pet.preview('review');
    advance(350);
    const frame = state.frame;
    documentStub.hidden = true;
    documentStub.dispatchEvent(new Event('visibilitychange'));
    expect(frames.size).toBe(0);
    advance(10000);
    expect(state.frame).toBe(frame);
    documentStub.hidden = false;
    documentStub.dispatchEvent(new Event('visibilitychange'));
    advance(16);
    expect(state.frame).toBe(frame);
    pet.destroy();
    expect(frames.size).toBe(0);
    event('click', { detail: 0 });
    expect(state.action).toBe('review');
  });
});
