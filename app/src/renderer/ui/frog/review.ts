import { KEYBOARD_FRAMES, SPRITE_FRAMES } from './atlas';
import { ACTIONS, ART_SCALE, PET_SIZE } from './motion';

const image = new Image();
const keyboard = new Image();
let ready = 0;
function renderFrames(): void {
  if (++ready < 2) return;
  const root = document.querySelector<HTMLElement>('#frames')!;
  for (const action of Object.values(ACTIONS)) {
    const heading = document.createElement('h2');
    heading.textContent = `${action.label} · ${action.frames} frames · ${action.duration} ms`;
    const row = document.createElement('div');
    row.className = 'frames';
    for (let i = 0; i < action.frames; i++) {
      const playing = action.row < 0;
      const source = playing ? KEYBOARD_FRAMES[i] : SPRITE_FRAMES[action.row][i];
      const figure = document.createElement('figure');
      const caption = document.createElement('figcaption');
      caption.textContent = `Frame ${i + 1}`;
      const canvas = document.createElement('canvas');
      canvas.width = PET_SIZE.width;
      canvas.height = PET_SIZE.height;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `${action.label}, frame ${i + 1}`);
      const context = canvas.getContext('2d')!;
      context.imageSmoothingEnabled = false;
      const artScale = playing ? 0.43 : ART_SCALE;
      const width = Math.round(source.width * artScale);
      const height = Math.round(source.height * artScale);
      context.drawImage(playing ? keyboard : image, source.x, source.y, source.width, source.height,
        Math.round((PET_SIZE.width - width) / 2), Math.round(PET_SIZE.height - 12 - height - source.lift * artScale), width, height);
      figure.append(canvas, caption);
      row.append(figure);
    }
    root.append(heading, row);
  }
}
image.addEventListener('load', renderFrames);
keyboard.addEventListener('load', renderFrames);
image.src = new URL('./green-frog.png', import.meta.url).href;
keyboard.src = new URL('./keyboard-frog.png', import.meta.url).href;
