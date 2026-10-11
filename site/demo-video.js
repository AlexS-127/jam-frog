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

function label(text, x, y, color = '#657167') {
  context.fillStyle = color;
  context.font = '600 15px Arial, sans-serif';
  context.fillText(text, x, y);
}

function headline(text, x, y, size = 54) {
  context.fillStyle = '#203329';
  context.font = `normal ${size}px Georgia, serif`;
  context.fillText(text, x, y);
}

function chord(text, x, y, active = false) {
  context.fillStyle = active ? '#315841' : '#68766a';
  context.font = `${active ? '600' : '400'} 20px Arial, sans-serif`;
  context.fillText(text, x, y);
  context.fillStyle = active ? '#91a77b' : '#d2d8ce';
  context.fillRect(x, y + 12, 100, 1);
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
  context.fillStyle = '#f3f1e7';
  context.fillRect(0, 0, 960, 540);
  label('JAM FROG  /  PRODUCT WALKTHROUGH', 32, 34, '#516453');
  label(`${String(scene + 1).padStart(2, '0')} / 04`, 884, 34, '#69766b');
  context.fillStyle = '#dfe5d9';
  context.fillRect(32, 51, 896, 1);
  context.fillStyle = '#6d8a5c';
  context.fillRect(32, 51, Math.round(896 * seconds / DURATION), 2);
  context.fillStyle = '#e4eadc';
  context.fillRect(550, 78, 378, 390);

  const titles = ['Start with what you play.', 'Explore a few next chords.', 'Invite a phrase in reply.', 'Keep the choice yours.'];
  const subtitles = [
    ['A few notes become a chord', 'inside the Ableton session.'],
    ['Local models rank options.', 'You choose what feels right.'],
    ['The response lands in time,', 'voiced near your register.'],
    ['Style guides the suggestions.', 'The musician stays in the lead.'],
  ];
  label(['PLAY', 'LISTEN', 'ANSWER', 'PHILOSOPHY'][scene], 54, 111, '#6c7b65');
  headline(titles[scene], 54, 170, scene === 3 ? 44 : 42);
  context.fillStyle = '#566358';
  context.font = '21px Arial, sans-serif';
  context.fillText(subtitles[scene][0], 54, 212);
  context.fillText(subtitles[scene][1], 54, 241);

  if (scene === 0) {
    label('PLAYED CHORDS', 54, 305, '#7a847a');
    chord('Cmaj7', 54, 341, true);
    chord('Am7', 176, 341, phase > .8);
    chord('Fmaj7', 298, 341, phase > 1.6);
    label('NOTES ARRIVE OVER LOCAL OSC', 54, 411, '#657167');
  } else if (scene === 1) {
    label('RANKED OPTIONS', 54, 305, '#7a847a');
    chord('Fmaj7', 54, 341, true);
    chord('G7', 176, 341, phase > .8);
    chord('Ab', 298, 341, phase > 1.6);
    label('N-GRAM + GRU RUN ON THE MAC', 54, 411, '#657167');
  } else if (scene === 2) {
    label('A PHRASE IN REPLY', 54, 305, '#7a847a');
    chord('Dm7', 54, 341, true);
    chord('G7', 176, 341, phase > .8);
    chord('Cmaj7', 298, 341, phase > 1.6);
    label('ANSWER ENGINE → FROG VOICE', 54, 411, '#657167');
  } else {
    label('ONE PARTNER · DIFFERENT APPROACHES', 54, 305, '#7a847a');
    chord('JAZZ', 54, 341, phase < .75);
    chord('ROCK', 176, 341, phase >= .75 && phase < 1.5);
    chord('POP', 298, 341, phase >= 1.5 && phase < 2.25);
    label('INSTRUMENT + CHORDS SHIFT WITH STYLE', 54, 411, '#657167');
  }

  const look = scene === 3 ? looks[Math.min(3, Math.floor(phase / .75))] : 'jazz';
  const playing = scene === 2 || scene === 3;
  const frame = Math.floor(seconds * (playing ? 7 : 4)) % 8 + (playing ? 8 : 0);
  drawFrog(look, frame, 573, 91, 330, 318);
  context.fillStyle = '#d3ddcb';
  context.fillRect(550, 425, 378, 1);
  context.fillStyle = '#405c47';
  context.font = '600 14px Arial, sans-serif';
  context.fillText(`${look.charAt(0).toUpperCase()}${look.slice(1)}  ·  ${playing ? 'playing' : 'listening'}`, 568, 450);
  label('ILLUSTRATIVE WALKTHROUGH · NO LIVE MIDI', 32, 516, '#657167');
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
      status.textContent = 'The illustrated walkthrough is ready to play or download. No live MIDI was recorded.';
      rendering = false;
      video.play().catch(() => {});
    };
    drawFrame(0);
    recorder.start();
    const started = performance.now();
    function paint() {
      const seconds = Math.max(0, Math.min(DURATION, (performance.now() - started) / 1000));
      drawFrame(seconds);
      status.textContent = `Rendering walkthrough… ${Math.min(100, Math.round(seconds / DURATION * 100))}%`;
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
