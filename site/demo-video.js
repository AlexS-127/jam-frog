import { genreFrame } from '../shared/genre-animations.ts';

const openButton = document.querySelector('[data-render-demo]');
const dialog = document.querySelector('[data-demo-dialog]');
const closeButton = document.querySelector('[data-demo-close]');
const canvas = document.querySelector('[data-demo-canvas]');
const video = document.querySelector('[data-demo-video]');
const status = document.querySelector('[data-demo-status]');
const download = document.querySelector('[data-demo-download]');
const context = canvas.getContext('2d');
const DURATION = 12;
const looks = ['jazz', 'rock', 'pop', 'electronic'];
const images = Object.fromEntries(looks.map((look) => [look, new Image()]));
let rendering = false;
let videoUrl = null;

function loadImage(look) {
  return new Promise((resolve, reject) => {
    const image = images[look];
    image.onload = resolve;
    image.onerror = reject;
    image.src = new URL(`./assets/genre-animations/${look}.png`, import.meta.url).href;
  });
}

function label(text, x, y, color = '#c6e572') {
  context.fillStyle = color;
  context.font = 'bold 18px Courier New, monospace';
  context.fillText(text, x, y);
}

function headline(text, x, y, size = 54) {
  context.fillStyle = '#10281a';
  context.font = `bold ${size}px Georgia, serif`;
  context.fillText(text, x, y);
}

function chip(text, x, y, width, active = false) {
  context.fillStyle = active ? '#c6e572' : '#203b28';
  context.fillRect(x, y, width, 47);
  context.strokeStyle = active ? '#c6e572' : '#668965';
  context.lineWidth = 2;
  context.strokeRect(x, y, width, 47);
  context.fillStyle = active ? '#10281a' : '#eee9d8';
  context.font = 'bold 19px Courier New, monospace';
  context.fillText(text, x + 14, y + 30);
}

function drawFrog(look, frame, x, y, width, height) {
  const source = genreFrame(look, frame);
  const scale = Math.min(width / source.width, height / source.height);
  const drawWidth = source.width * scale;
  const drawHeight = source.height * scale;
  context.drawImage(images[look], source.x, source.y, source.width, source.height,
    x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawFrame(seconds) {
  const scene = Math.min(3, Math.floor(seconds / 3));
  const phase = seconds % 3;
  context.imageSmoothingEnabled = false;
  context.fillStyle = '#eee9d8';
  context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#10281a';
  context.fillRect(0, 0, 960, 54);
  label('JAM FROG / DEMO TAPE', 30, 35);
  label(`${String(scene + 1).padStart(2, '0')} / 04`, 837, 35, '#eee9d8');
  context.fillStyle = '#d8e5b9';
  context.fillRect(0, 54, 960, 5);
  context.fillStyle = '#668f47';
  context.fillRect(0, 54, Math.round(960 * seconds / DURATION), 5);
  context.fillStyle = '#10281a';
  context.fillRect(515, 86, 407, 399);
  context.strokeStyle = '#10281a';
  context.lineWidth = 3;
  context.strokeRect(30, 86, 455, 399);

  const titles = ['You play.', 'Frog listens.', 'Frog answers.', 'Find your sound.'];
  const subtitles = [
    ['A few notes become', 'a chord in Live.'],
    ['Local models suggest', 'three ways forward.'],
    ['A new phrase lands', 'on the next bar.'],
    ['Eight genre frogs,', 'each with a part.'],
  ];
  label(['01 / PLAY', '02 / LISTEN', '03 / ANSWER', '04 / PICK A GENRE'][scene], 55, 125, '#315b3a');
  headline(titles[scene], 55, 193, scene === 3 ? 45 : 54);
  context.fillStyle = '#274833';
  context.font = '25px Georgia, serif';
  context.fillText(subtitles[scene][0], 55, 238);
  context.fillText(subtitles[scene][1], 55, 271);

  if (scene === 0) {
    chip('Cmaj7', 55, 322, 120, true);
    chip('Am7', 188, 322, 100, phase > .8);
    chip('Fmaj7', 301, 322, 120, phase > 1.6);
    label('LIVE NOTES  →  ONSET GROUPER', 55, 411, '#315b3a');
  } else if (scene === 1) {
    chip('Fmaj7', 55, 312, 126, true);
    chip('G7', 194, 312, 95);
    chip('Ab', 302, 312, 95);
    label('N-GRAM + GRU / LOCAL', 55, 411, '#315b3a');
  } else if (scene === 2) {
    chip('Dm7', 55, 312, 105, true);
    chip('G7', 173, 312, 85, true);
    chip('Cmaj7', 271, 312, 126, true);
    label('ANSWER ENGINE / MIDI OUT', 55, 411, '#315b3a');
  } else {
    chip('JAZZ', 55, 312, 96, phase < .75);
    chip('ROCK', 162, 312, 96, phase >= .75 && phase < 1.5);
    chip('POP', 269, 312, 84, phase >= 1.5 && phase < 2.25);
    label('IDLE + PERFORMANCE POSES', 55, 411, '#315b3a');
  }

  const look = scene === 3 ? looks[Math.min(3, Math.floor(phase / .75))] : 'jazz';
  const playing = scene === 2 || scene === 3;
  const frame = Math.floor(seconds * (playing ? 7 : 4)) % 8 + (playing ? 8 : 0);
  context.fillStyle = '#30583a';
  context.fillRect(535, 106, 367, 305);
  drawFrog(look, frame, 554, 113, 329, 288);
  context.fillStyle = '#c6e572';
  context.fillRect(535, 421, 367, 45);
  context.fillStyle = '#10281a';
  context.font = 'bold 17px Courier New, monospace';
  context.fillText(`${look.toUpperCase()}  /  ${playing ? 'PLAYING' : 'LISTENING'}`, 550, 450);
  label('ILLUSTRATIVE · NOT CONNECTED TO ABLETON', 30, 516, '#315b3a');
}

async function renderDemo() {
  if (rendering || videoUrl) return;
  rendering = true;
  canvas.hidden = false;
  video.hidden = true;
  download.hidden = true;
  status.textContent = 'Loading the illustrated demo…';
  try {
    await Promise.all(looks.map(loadImage));
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
      .find((type) => window.MediaRecorder?.isTypeSupported(type));
    if (!mimeType || !canvas.captureStream) throw new Error('Video rendering is unavailable in this browser.');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4000000 });
    const chunks = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { status.textContent = 'Video recording stopped unexpectedly. Try again.'; rendering = false; };
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      videoUrl = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
      video.src = videoUrl;
      video.hidden = false;
      canvas.hidden = true;
      download.href = videoUrl;
      download.download = `jam-frog-demo.${mimeType === 'video/mp4' ? 'mp4' : 'webm'}`;
      download.hidden = false;
      status.textContent = 'Your 12-second illustrated demo is ready to play or download. No live MIDI was recorded.';
      rendering = false;
      video.play().catch(() => {});
    };
    drawFrame(0);
    recorder.start();
    const started = performance.now();
    function paint() {
      const seconds = Math.max(0, Math.min(DURATION, (performance.now() - started) / 1000));
      drawFrame(seconds);
      status.textContent = `Rendering demo tape… ${Math.min(100, Math.round(seconds / DURATION * 100))}%`;
      if (seconds < DURATION) requestAnimationFrame(paint);
      else recorder.stop();
    }
    requestAnimationFrame(paint);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not render the demo video.';
    rendering = false;
  }
}

openButton.addEventListener('click', () => {
  dialog.showModal();
  if (!videoUrl) renderDemo();
  else video.play().catch(() => {});
});
closeButton.addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => video.pause());
window.addEventListener('pagehide', () => { if (videoUrl) URL.revokeObjectURL(videoUrl); });
