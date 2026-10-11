import { genreFrame } from '../shared/genre-animations.ts';

const spriteUrls = {
  all: new URL('./assets/default-frog.png', import.meta.url).href,
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
}

export function paintFrog(context, look, frame, box) {
  const image = images.get(look);
  if (!image) return;
  const source = look === 'all'
    ? { x: 90, y: 190, width: 1076, height: 912 }
    : genreFrame(look, frame);
  const scale = Math.min(box.width / source.width, box.height / source.height);
  const width = source.width * scale;
  const height = source.height * scale;
  const x = box.x + (box.width - width) / 2;
  const y = box.y + box.height - height;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, source.x, source.y, source.width, source.height, x, y, width, height);
}

const frogs = [...document.querySelectorAll('[data-frog-look]')].map((canvas) => ({
  canvas, context: canvas.getContext('2d'), look: canvas.dataset.frogLook,
  button: canvas.closest('button'),
}));

function paint(frog) {
  const { canvas, context } = frog;
  context.clearRect(0, 0, canvas.width, canvas.height);
  paintFrog(context, frog.look, 0, { x: 12, y: 15, width: canvas.width - 24, height: canvas.height - 32 });
}
frogs.forEach((frog) => {
  loadFrog(frog.look).then(() => paint(frog)).catch((error) => {
    frog.button.title = error.message;
    console.error(error);
  });
});
