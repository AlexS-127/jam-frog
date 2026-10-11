import { SPRITE_FRAMES, KEYBOARD_FRAMES } from '../app/src/renderer/ui/frog/atlas.ts';
import { drawTongue, tonguePose } from '../app/src/renderer/ui/frog/tongue.ts';
import { GENRE_ANIMATIONS, genreFrame } from '../shared/genre-animations.ts';

const spriteUrls = {
  all: new URL('../app/src/renderer/ui/frog/sprites/a/green-frog.png', import.meta.url).href,
  keyboard: new URL('../app/src/renderer/ui/frog/sprites/a/keyboard-frog.png', import.meta.url).href,
  jazz: new URL('../app/src/renderer/ui/frog/sprites/a/genres/jazz.png', import.meta.url).href,
  rock: new URL('../app/src/renderer/ui/frog/sprites/a/genres/rock.png', import.meta.url).href,
  punk: new URL('../app/src/renderer/ui/frog/sprites/a/genres/punk.png', import.meta.url).href,
  pop: new URL('../app/src/renderer/ui/frog/sprites/a/genres/pop.png', import.meta.url).href,
  country: new URL('../app/src/renderer/ui/frog/sprites/a/genres/country.png', import.meta.url).href,
  electronic: new URL('../app/src/renderer/ui/frog/sprites/a/genres/electronic.png', import.meta.url).href,
};
const images = new Map();
const pendingImages = new Map();

function loadImage(name) {
  if (!pendingImages.has(name)) {
    pendingImages.set(name, new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => { images.set(name, image); resolve(image); }, { once: true });
      image.addEventListener('error', () => { pendingImages.delete(name); reject(new Error('Could not load the ' + name + ' sprite.')); }, { once: true });
      image.src = spriteUrls[name];
    }));
  }
  return pendingImages.get(name);
}

export async function loadFrog(look) {
  await loadImage(look);
  if (look === 'all') await loadImage('keyboard');
}

export function paintFrog(context, look, frame, box, tongueFrame = 0) {
  const playing = frame >= 8;
  const image = images.get(look === 'all' && playing ? 'keyboard' : look);
  if (!image) return;
  const source = look === 'all'
    ? playing ? KEYBOARD_FRAMES[(frame - 8) % KEYBOARD_FRAMES.length] : SPRITE_FRAMES[0][0]
    : genreFrame(look, frame);
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + box.height - height;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
  const pose = tonguePose(tongueFrame);
  if (pose) {
    const mouth = look === 'all' ? [.5, .44] : GENRE_ANIMATIONS[look].mouth;
    drawTongue(context, Math.round(x + width * mouth[0]), Math.round(y + height * mouth[1]),
      Math.max(2, Math.round((look === 'all' ? 2 : 10) * scale)), pose);
  }
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const frogs = [...document.querySelectorAll('[data-frog-look]')].map((canvas) => ({
  canvas, context: canvas.getContext('2d'), look: canvas.dataset.frogLook,
  button: canvas.closest('button'), hovered: false, focused: false, frame: 0, timers: [],
}));

function paint(frog) {
  const { canvas, context } = frog;
  context.clearRect(0, 0, canvas.width, canvas.height);
  paintFrog(context, frog.look, 0, { x: 12, y: 15, width: canvas.width - 24, height: canvas.height - 32 }, frog.frame);
  canvas.dataset.tongueFrame = String(frog.frame);
}
function greet(frog) {
  frog.timers.forEach(clearTimeout);
  frog.timers = [];
  frog.frame = 0;
  paint(frog);
  if (!frog.hovered && !frog.focused) return;
  if (reducedMotion.matches) {
    frog.frame = 2;
    paint(frog);
    return;
  }
  // Hold the full tongue while pointed at; only neutral, half, and full are drawn.
  frog.timers = [1, 2].map((frame) => setTimeout(() => {
    frog.frame = frame;
    paint(frog);
  }, frame * 130));
}
frogs.forEach((frog) => {
  loadFrog(frog.look).then(() => paint(frog)).catch((error) => {
    frog.button.title = error.message;
    console.error(error);
  });
  for (const [event, state, value] of [
    ['pointerenter', 'hovered', true], ['pointerleave', 'hovered', false],
    ['focus', 'focused', true], ['blur', 'focused', false],
  ]) {
    frog.button.addEventListener(event, () => {
      frog[state] = event === 'focus' ? frog.button.matches(':focus-visible') : value;
      greet(frog);
    });
  }
});
reducedMotion.addEventListener('change', () => frogs.forEach(greet));
window.addEventListener('pagehide', () => frogs.forEach((frog) => frog.timers.forEach(clearTimeout)));
