import { ACTIONS, ART_SCALE, PET_SIZE, frameAt } from '../app/src/renderer/ui/frog/motion.ts';
import {
  ATLAS_HEIGHT, ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT, KEYBOARD_ATLAS_WIDTH,
  KEYBOARD_FRAMES, SPRITE_FRAMES,
} from '../app/src/renderer/ui/frog/atlas.ts';

const atlas = new Image();
const keyboardAtlas = new Image();
const frogs = [...document.querySelectorAll('[data-frog-look]')].map((canvas) => ({
  canvas,
  context: canvas.getContext('2d'),
  look: canvas.dataset.frogLook,
  greeting: null,
  greetingStarts: 0,
}));
const actionButtons = [...document.querySelectorAll('[data-action]')];
const status = document.querySelector('[data-movement-status]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let selectedAction = 'idle';
let actionStarted = performance.now();
let loaded = false;

function rect(context, color, x, y, width, height) {
  context.fillStyle = color;
  context.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function px(context, color, x, y, width, height, unit) {
  rect(context, color, x * unit, y * unit, width * unit, height * unit);
}

function drawOutfit(context, look, x, y, width, height, frame) {
  const unit = Math.max(2, Math.round(width / 36));
  const sx = (part) => x + Math.round(width * part);
  const sy = (part) => y + Math.round(height * part);
  const p = (color, gx, gy, gw, gh) => px(context, color, sx(0) / unit + gx, sy(0) / unit + gy, gw, gh, unit);

  if (look === 'jazz') {
    // Low, jaunty beret and a gold neckerchief.
    p('#17301b', 12, 0, 12, 3); p('#17301b', 15, -1, 8, 1);
    p('#9a6828', 16, 10, 7, 2); p('#f0c64c', 15, 12, 8, 2); p('#d99a35', 19, 14, 3, 3);
    // Saxophone: curved brass body, bell, mouthpiece and dark pixel outline.
    p('#573c1d', 26, 15, 2, 10); p('#573c1d', 24, 23, 4, 2); p('#573c1d', 22, 24, 3, 2);
    p('#e8af38', 27, 15, 2, 8); p('#f5d45c', 25, 22, 3, 2); p('#d68a2f', 22, 24, 4, 2);
    p('#ffe37a', 28, 17, 1, 2); p('#fff0a0', 25, 23, 1, 1);
  } else if (look === 'rock') {
    // Spiked red mohawk, studded vest and a sharp electric guitar.
    p('#4a2022', 15, -1, 3, 4); p('#8d2527', 17, -3, 3, 5); p('#ef513e', 20, -2, 3, 5);
    p('#9f2928', 23, 0, 2, 4); p('#20281d', 12, 13, 4, 10); p('#20281d', 24, 13, 4, 10);
    p('#f2c95d', 13, 15, 1, 1); p('#f2c95d', 25, 16, 1, 1); p('#f2c95d', 14, 20, 1, 1);
    p('#371d20', 23, 19, 3, 8); p('#c72d39', 25, 20, 5, 6); p('#f04b51', 28, 18, 3, 4);
    p('#c72d39', 22, 24, 5, 3); p('#f2d487', 28, 19, 5, 1); p('#f2d487', 32, 18, 1, 3);
    p('#fff0ba', 28, 20, 1, 5); p('#fff0ba', 30, 20, 1, 5);
  } else if (look === 'country') {
    // Broad-brimmed tan hat and a bandana above an acoustic guitar.
    p('#68472a', 8, 4, 20, 2); p('#a97b43', 12, 1, 12, 4); p('#d8ad68', 15, 2, 7, 1);
    p('#8d3e2e', 14, 11, 10, 2); p('#ed7547', 16, 12, 7, 2); p('#ed7547', 19, 14, 3, 2);
    p('#593a25', 26, 18, 2, 8); p('#9b6534', 25, 21, 7, 7); p('#d1944e', 26, 22, 5, 5);
    p('#6b4729', 28, 18, 2, 5); p('#edd08b', 28, 19, 1, 5); p('#edd08b', 30, 19, 1, 5);
    p('#f1d7a1', 27, 23, 1, 1);
  } else if (look === 'electronic') {
    // Over-ear headphones and two luminous pixel lightsticks.
    p('#24232c', 10, 5, 3, 7); p('#24232c', 27, 5, 3, 7); p('#24232c', 13, 3, 14, 2);
    p('#8e55d9', 11, 7, 2, 4); p('#38ddda', 28, 7, 2, 4); p('#b78aff', 15, 4, 9, 1);
    p('#192b37', 11, 15, 3, 8); p('#192b37', 28, 15, 3, 8);
    p('#26dbdb', 12, 14, 1, 8); p('#ff5cd8', 29, 14, 1, 8);
    p('#8df9ee', 11, 13, 3, 1); p('#ffb4eb', 28, 13, 3, 1);
    p('#31506a', 11, 23, 3, 2); p('#31506a', 28, 23, 3, 2);
  }
}

function paint(frog, now) {
  const { canvas, context } = frog;
  if (!loaded || !context) return;
  const greet = frog.greeting;
  const greetingDone = greet && now - frog.greetingStarts >= ACTIONS[greet].duration;
  if (greetingDone) frog.greeting = null;
  const action = frog.greeting ?? selectedAction;
  const elapsed = action === selectedAction && !frog.greeting ? now - actionStarted : now - frog.greetingStarts;
  const frame = reducedMotion.matches ? 0 : frameAt(action, elapsed, !frog.greeting);
  const source = action === 'playing' ? KEYBOARD_FRAMES[frame] : SPRITE_FRAMES[ACTIONS[action].row][frame];
  const image = action === 'playing' ? keyboardAtlas : atlas;
  const scale = action === 'playing' ? 0.43 : ART_SCALE;
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const x = Math.round((PET_SIZE.width - width) / 2);
  const y = Math.round(PET_SIZE.height - 12 - height - source.lift * scale);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
  drawOutfit(context, frog.look, x, y, width, height, frame);
}

function animate(now) {
  frogs.forEach((frog) => paint(frog, now));
  requestAnimationFrame(animate);
}

function loadAtlas(image, url, dimensions, onReady) {
  image.addEventListener('load', () => {
    if (image.naturalWidth !== dimensions[0] || image.naturalHeight !== dimensions[1]) return;
    onReady();
  }, { once: true });
  image.src = url;
}

loadAtlas(atlas, new URL('./assets/frog-atlas.png', import.meta.url), [ATLAS_WIDTH, ATLAS_HEIGHT], () => {
  loadAtlas(keyboardAtlas, new URL('./assets/frog-keyboard.png', import.meta.url), [KEYBOARD_ATLAS_WIDTH, KEYBOARD_ATLAS_HEIGHT], () => {
    loaded = true;
    requestAnimationFrame(animate);
  });
});

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
    status.textContent = `All four frogs: ${ACTIONS[selectedAction].label}`;
  });
});

window.addEventListener('frog-look-selected', (event) => {
  const frog = frogs.find((item) => item.look === event.detail);
  if (!frog) return;
  frog.greeting = frog.greeting === 'waving' ? 'jumping' : 'waving';
  frog.greetingStarts = performance.now();
});

reducedMotion.addEventListener('change', () => frogs.forEach((frog) => paint(frog, performance.now())));
