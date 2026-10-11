import { ACTIONS, frameAt } from '../app/src/renderer/ui/frog/motion.ts';

const SPRITE_SHEET = { width: 1312, height: 1199 };
const SPRITE_REGIONS = {
  jazz: { x: 0, y: 0, width: 656, height: 640 },
  rock: { x: 656, y: 0, width: 656, height: 640 },
  country: { x: 0, y: 640, width: 656, height: 559 },
  electronic: { x: 656, y: 640, width: 656, height: 559 },
};

// Each motion is applied to the complete, baked-in genre sprite so the frog,
// clothing, and instrument always move together as one pixel-art character.
const MOVEMENTS = {
  idle: [[0, 0, 1, 1], [-1, -2, 1, 1], [0, -3, 1, 1], [1, -2, 1, 1], [0, -1, 1, 1], [0, 0, 1, 1]],
  waving: [[0, 0, 1, 1], [-2, -2, 0.99, 1.01], [2, -3, 1.01, 1], [-1, -1, 0.99, 1.01]],
  jumping: [[0, 0, 1, 1], [0, -5, 0.99, 1.02], [0, -13, 1.01, 0.98], [0, -17, 0.98, 1.02], [0, -3, 1.03, 0.96]],
  failed: [[0, 0, 1, 1], [0, 1, 1.01, 0.99], [0, 3, 1.02, 0.97], [0, 4, 1.03, 0.96], [0, 4, 1.03, 0.96], [0, 3, 1.02, 0.97], [0, 1, 1.01, 0.99], [0, 0, 1, 1]],
  waiting: [[0, 0, 1, 1], [-1, -2, 1, 1], [0, -3, 1, 1], [1, -2, 1, 1], [0, -1, 1, 1], [0, 0, 1, 1]],
  review: [[0, 0, 1, 1], [1, -1, 1, 1], [2, -2, 1, 1], [1, -2, 1, 1], [-1, -1, 1, 1], [0, 0, 1, 1]],
  playing: [[0, 0, 1, 1], [0, -2, 1.01, 0.99], [1, -3, 1, 1.01], [0, -2, 1.01, 0.99], [-1, 0, 1, 1.01], [0, 0, 1, 1]],
};
const MOVEMENT_LABELS = {
  idle: 'Idle', waving: 'Wave', jumping: 'Jump', failed: 'Sad',
  waiting: 'Wait', review: 'Think', playing: 'Play',
};

const image = new Image();
// Mouth centers in the source sheet stay accurate even when the instrument
// changes the character's crop width. The tongue shares the sprite transform.
const TONGUE_ANCHORS = {
  jazz: [362, 337], rock: [947, 337], country: [362, 887], electronic: [947, 887],
};
const frogs = [...document.querySelectorAll('[data-frog-look]')].map((canvas, index) => ({
  canvas,
  context: canvas.getContext('2d'),
  look: canvas.dataset.frogLook,
  index,
  greeting: null,
  greetingStarts: 0,
}));
const actionButtons = [...document.querySelectorAll('[data-action]')];
const status = document.querySelector('[data-movement-status]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let selectedAction = 'idle';
let actionStarted = performance.now();
let loaded = false;
let animationFrame = null;
let spriteBounds = {};

function findSpriteBounds(pixels, region) {
  const rowCounts = new Uint16Array(region.height);
  const columnCounts = new Uint16Array(region.width);
  for (let y = 0; y < region.height; y += 1) {
    for (let x = 0; x < region.width; x += 1) {
      const alpha = pixels[((region.y + y) * SPRITE_SHEET.width + region.x + x) * 4 + 3];
      if (alpha < 16) continue;
      rowCounts[y] += 1;
      columnCounts[x] += 1;
    }
  }
  const minY = rowCounts.findIndex((count) => count > 2);
  const maxY = rowCounts.findLastIndex((count) => count > 2);
  const minX = columnCounts.findIndex((count) => count > 2);
  const maxX = columnCounts.findLastIndex((count) => count > 2);
  if (minX < 0 || minY < 0) return null;
  return { x: region.x + minX, y: region.y + minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function prepareSprites() {
  const source = document.createElement('canvas');
  source.width = SPRITE_SHEET.width;
  source.height = SPRITE_SHEET.height;
  const context = source.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, source.width, source.height).data;
  spriteBounds = Object.fromEntries(Object.entries(SPRITE_REGIONS).map(([look, region]) => [
    look,
    findSpriteBounds(pixels, region),
  ]));
}

function poseFor(action, elapsed, loop) {
  const index = frameAt(action, elapsed, loop);
  return MOVEMENTS[action][index];
}

function tonguePose(elapsed, index) {
  const interval = 8600 + index * 730;
  const phase = (elapsed + index * 1700) % interval - 5700;
  if (phase < 0 || phase >= 380) return null;

  // Open, flick outward quickly, then draw the tongue back into the mouth.
  const smooth = (value) => value * value * (3 - 2 * value);
  const reach = phase < 40 ? 0
    : phase < 130 ? 1 - (1 - (phase - 40) / 90) ** 3
      : phase < 160 ? 1
        : phase < 340 ? 1 - smooth((phase - 160) / 180) : 0;
  const open = phase < 40 ? smooth(phase / 40)
    : phase < 340 ? 1 : 1 - smooth((phase - 340) / 40);
  return { reach, open };
}

function drawTongue(context, look, sprite, scale, x, y, pose) {
  const [mouthX, mouthY] = TONGUE_ANCHORS[look];
  const pixel = Math.max(2, Math.round(10 * scale));
  const left = Math.round(x + (mouthX - sprite.x) * scale);
  const top = Math.round(y + (mouthY - sprite.y) * scale);
  const opening = Math.round(pixel * pose.open);
  if (!opening) return;
  context.fillStyle = '#191b13';
  context.fillRect(left - pixel * 2, top - opening, pixel * 4, opening * 2);
  if (pose.reach <= 0) return;

  // A shallow arc keeps the flick clear of the instruments. Sample it on a
  // pixel grid, with a narrow shaft and one rounded, unforked sticky tip.
  const length = Math.round(150 * scale * pose.reach / pixel);
  if (!length) return;
  const points = Array.from({ length: length + 1 }, (_, step) => {
    const progress = step / length;
    return [
      left - step * pixel,
      top + Math.round((26 * scale * pose.reach * progress ** 2) / pixel) * pixel,
    ];
  });
  const [tipX, tipY] = points[points.length - 1];
  context.fillStyle = '#812e46';
  points.forEach(([px, py]) => context.fillRect(px - 1, py - 1, pixel + 2, pixel + 2));
  context.fillRect(tipX - 1, Math.round(tipY - pixel / 2) - 1, pixel * 2 + 2, pixel * 2 + 2);
  context.fillStyle = '#e94e68';
  points.forEach(([px, py]) => context.fillRect(px, py, pixel, pixel));
  context.fillRect(tipX, Math.round(tipY - pixel / 2), pixel * 2, pixel * 2);
  context.fillStyle = '#ff8c9c';
  context.fillRect(tipX, Math.round(tipY - pixel / 2), pixel, 1);
}

function paint(frog, now) {
  if (!loaded || !frog.context) return;
  if (frog.greeting && now - frog.greetingStarts >= ACTIONS[frog.greeting].duration) {
    frog.greeting = null;
  }

  const action = frog.greeting ?? selectedAction;
  const elapsed = frog.greeting ? now - frog.greetingStarts : now - actionStarted;
  const [offsetX, offsetY, scaleX, scaleY] = reducedMotion.matches
    ? MOVEMENTS[action][0]
    : poseFor(action, elapsed, !frog.greeting);
  const { canvas, context } = frog;
  const sprite = spriteBounds[frog.look];
  if (!sprite) return;
  const scale = Math.min((canvas.width - 12) / sprite.width, (canvas.height - 16) / sprite.height);
  const width = sprite.width * scale;
  const height = sprite.height * scale;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.save();
  context.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  context.scale(scaleX, scaleY);
  context.drawImage(
    image,
    sprite.x, sprite.y, sprite.width, sprite.height,
    -width / 2, -height / 2, width, height,
  );
  const tongue = !reducedMotion.matches && (action === 'idle' || action === 'waiting')
    ? tonguePose(elapsed, frog.index) : null;
  if (tongue) {
    drawTongue(context, frog.look, sprite, scale, -width / 2, -height / 2, tongue);
  }
  context.restore();
}

function animate(now) {
  animationFrame = null;
  frogs.forEach((frog) => paint(frog, now));
  if (!reducedMotion.matches) animationFrame = window.requestAnimationFrame(animate);
}

function redraw() {
  if (!loaded) return;
  frogs.forEach((frog) => paint(frog, performance.now()));
  if (!reducedMotion.matches && animationFrame === null) {
    animationFrame = window.requestAnimationFrame(animate);
  }
}

image.addEventListener('load', () => {
  if (image.naturalWidth !== SPRITE_SHEET.width || image.naturalHeight !== SPRITE_SHEET.height) {
    console.warn('[genre_sprites] Costume sprite dimensions do not match their frame map.');
    return;
  }
  loaded = true;
  prepareSprites();
  redraw();
});
image.addEventListener('error', () => console.warn('[genre_sprites] Could not load the local outfit sprite sheet.'));
image.src = new URL('./assets/frog-genre-outfits.png', import.meta.url).href;

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    selectedAction = button.dataset.action;
    actionStarted = performance.now();
    frogs.forEach((frog) => { frog.greeting = null; });
    actionButtons.forEach((item) => {
      const active = item === button;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', String(active));
    });
    status.textContent = `All four frogs: ${MOVEMENT_LABELS[selectedAction]}`;
    redraw();
  });
});

window.addEventListener('frog-look-selected', (event) => {
  const frog = frogs.find((item) => item.look === event.detail);
  if (!frog) return;
  frog.greeting = frog.greeting === 'waving' ? 'jumping' : 'waving';
  frog.greetingStarts = performance.now();
  redraw();
});

reducedMotion.addEventListener('change', () => {
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  animationFrame = null;
  redraw();
});
