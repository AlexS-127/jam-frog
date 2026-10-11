import { ACTIONS, frameAt } from '../app/src/renderer/ui/frog/motion.ts';
import { GENRE_ANIMATIONS, GENRE_FRAME_COUNT, GENRE_LOOKS, genreFrame, genreFrameSize } from '../shared/genre-animations.ts';

const LOOKS = GENRE_LOOKS;
const FRAMES_PER_ACTION = GENRE_FRAME_COUNT;
const LOOP_DURATION = { idle: 1600, waiting: 1800, playing: 1100 };
const MOVEMENTS = {
  waving: [[0, 0, 1, 1], [-2, -2, 0.99, 1.01], [2, -3, 1.01, 1], [-1, -1, 0.99, 1.01]],
  jumping: [[0, 0, 1, 1], [0, -5, 0.99, 1.02], [0, -13, 1.01, 0.98], [0, -17, 0.98, 1.02], [0, -3, 1.03, 0.96]],
  failed: [[0, 0, 1, 1], [0, 1, 1.01, 0.99], [0, 3, 1.02, 0.97], [0, 4, 1.03, 0.96], [0, 4, 1.03, 0.96], [0, 3, 1.02, 0.97], [0, 1, 1.01, 0.99], [0, 0, 1, 1]],
  review: [[0, 0, 1, 1], [1, -1, 1, 1], [2, -2, 1, 1], [1, -2, 1, 1], [-1, -1, 1, 1], [0, 0, 1, 1]],
};
const MOVEMENT_LABELS = {
  idle: 'Idle', waving: 'Wave', jumping: 'Jump', failed: 'Sad',
  waiting: 'Wait', review: 'Think', playing: 'Play',
};
const images = Object.fromEntries(LOOKS.map((look) => [look, new Image()]));
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
let animationFrame = null;

function tonguePose(elapsed, index) {
  const interval = 8600 + index * 730;
  const phase = (elapsed + index * 1700) % interval - 5700;
  if (phase < 0 || phase >= 900) return null;
  const smooth = (value) => value * value * (3 - 2 * value);
  const reach = phase < 50 ? 0
    : phase < 210 ? smooth((phase - 50) / 160)
      : phase < 550 ? 1
        : phase < 850 ? 1 - smooth((phase - 550) / 300) : 0;
  const open = phase < 50 ? smooth(phase / 50)
    : phase < 850 ? 1 : 1 - smooth((phase - 850) / 50);
  return { reach, open };
}

function drawTongue(context, center, top, pixel, pose) {
  const opening = Math.round(pixel * pose.open);
  if (!opening) return;
  const length = Math.round(pixel * 5 * pose.reach);
  const left = center - pixel * 2;
  const corner = Math.min(pixel, Math.floor(length / 2));
  if (length > 1) {
    context.fillStyle = '#663f36';
    context.fillRect(left, top, pixel * 4, length - corner);
    context.fillRect(left + corner, top + length - corner, pixel * 4 - corner * 2, corner);
    context.fillStyle = '#d97980';
    context.fillRect(left + 1, top, pixel * 4 - 2, Math.max(0, length - corner - 1));
    context.fillRect(left + corner + 1, top, pixel * 4 - corner * 2 - 2, length - 1);
    context.fillStyle = '#f39b9e';
    context.fillRect(left + 1, top + 1, 1, Math.max(0, length - corner - 3));
    context.fillStyle = '#99505a';
    context.fillRect(center, top, 1, Math.round(length * 0.4));
  }
  context.fillStyle = '#191b13';
  context.fillRect(center - pixel * 3, top - opening, pixel * 6, opening);
}

function poseFor(action, elapsed, greeting) {
  if (action === 'playing' || action === 'idle' || action === 'waiting') {
    const duration = LOOP_DURATION[action];
    const index = reducedMotion.matches ? 0 : Math.floor(Math.max(0, elapsed) / duration * FRAMES_PER_ACTION) % FRAMES_PER_ACTION;
    return { index: index + (action === 'playing' ? FRAMES_PER_ACTION : 0), movement: [0, 0, 1, 1] };
  }
  const frame = reducedMotion.matches ? 0 : frameAt(action, elapsed, !greeting);
  return { index: frame, movement: MOVEMENTS[action][frame] };
}

function paint(frog, now) {
  const { canvas, context, look } = frog;
  const image = images[look];
  if (!context || !image?.complete || !image.naturalWidth) return;
  if (frog.greeting && now - frog.greetingStarts >= ACTIONS[frog.greeting].duration) frog.greeting = null;
  const action = frog.greeting ?? selectedAction;
  const elapsed = frog.greeting ? now - frog.greetingStarts : now - actionStarted;
  const { index, movement: [offsetX, offsetY, scaleX, scaleY] } = poseFor(action, elapsed, frog.greeting);
  const source = genreFrame(look, index);
  const maxSize = genreFrameSize(look);
  const scale = Math.min((canvas.width - 8) / maxSize.width, (canvas.height - 8) / maxSize.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = -width / 2;
  const y = -height / 2;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = false;
  context.save();
  context.translate(canvas.width / 2 + offsetX, canvas.height / 2 + offsetY);
  context.scale(scaleX, scaleY);
  context.drawImage(
    image, source.x, source.y, source.width, source.height, x, y, width, height,
  );
  const tongue = !reducedMotion.matches && (action === 'idle' || action === 'waiting')
    ? tonguePose(elapsed, frog.index) : null;
  if (tongue) {
    const [mouthX, mouthY] = GENRE_ANIMATIONS[look].mouth;
    drawTongue(context, Math.round(x + width * mouthX), Math.round(y + height * mouthY),
      Math.max(2, Math.round(10 * scale)), tongue);
  }
  context.restore();
}

function animate(now) {
  animationFrame = null;
  frogs.forEach((frog) => paint(frog, now));
  if (!reducedMotion.matches) animationFrame = window.requestAnimationFrame(animate);
}

function redraw() {
  frogs.forEach((frog) => paint(frog, performance.now()));
  if (!reducedMotion.matches && animationFrame === null) animationFrame = window.requestAnimationFrame(animate);
}

for (const look of LOOKS) {
  images[look].addEventListener('load', () => {
    const { width, height } = GENRE_ANIMATIONS[look];
    if (images[look].naturalWidth !== width || images[look].naturalHeight !== height) {
      console.warn(`[genre_sprites] ${look} sprite dimensions do not match its frame map.`);
      return;
    }
    redraw();
  });
  images[look].addEventListener('error', () => console.warn(`[genre_sprites] Could not load ${look} sprite frames.`));
  images[look].src = new URL(`./assets/genre-animations/${look}.png`, import.meta.url).href;
}

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
    status.textContent = `All ${frogs.length} frogs: ${MOVEMENT_LABELS[selectedAction]}`;
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
