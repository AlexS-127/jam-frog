import { loadFrog, paintFrog } from './frog-looks.js';

const profiles = {
  all: { title: 'All styles', description: 'Your own sound, beyond the genre labels. Use the user Instrument Rack chain for a custom synth, piano, or ambient texture.' },
  jazz: { title: 'Jazz', description: 'Hollow-body guitar, close voicings, and room for harmonic color. Pick the sound and effects on your Jazz rack chain in Live.' },
  rock: { title: 'Rock', description: 'A guitar bandmate for your next progression. Your Live instrument and effects give the frog its tone.' },
  punk: { title: 'Punk', description: 'A rhythm-guitar companion for punk, metal, and alternative influences. Keep your playing and steer the next phrase.' },
  pop: { title: 'Pop', description: 'Piano-friendly ideas for a new hook or the next section of a song. Pop also draws on pop-rock patterns.' },
  country: { title: 'Country', description: 'Acoustic-guitar inspiration with optional Ample Guitar strums. Your instrument chain supplies the actual sound.' },
  electronic: { title: 'Electronic', description: 'Harmonic starting points for your synths and textures. Route the frog to any MIDI instrument on its Live track.' },
};
const recordings = import.meta.glob('./demo-videos/*.{mp4,webm}', { eager: true, query: '?url', import: 'default' });
const subtitles = import.meta.glob('./demo-videos/*.vtt', { eager: true, query: '?url', import: 'default' });
const dialog = document.querySelector('[data-demo-dialog]');
const canvas = document.querySelector('[data-demo-canvas]');
const context = canvas.getContext('2d');
const video = document.querySelector('[data-demo-video]');
const status = document.querySelector('[data-demo-status]');
const playButton = document.querySelector('[data-demo-play]');
const download = document.querySelector('[data-demo-download]');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const cache = new Map();
const DURATION = 12;
let look = 'all';
let animation = null;
let recorder = null;
let stream = null;
let generation = 0;
let recordedSource = null;
let opener = null;

function recordingFor(name) {
  return recordings['./demo-videos/' + name + '.mp4'] || recordings['./demo-videos/' + name + '.webm'];
}
function stopPreview() {
  generation += 1;
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  recorder = null;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  video.pause();
}
function drawFrame(seconds) {
  seconds = Math.max(0, Math.min(DURATION, seconds));
  const scene = Math.min(3, Math.floor(seconds / 3));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, 960, 540);
  context.fillStyle = '#f8ed6c';
  context.fillRect(0, 0, 960, 58);
  context.fillStyle = '#222820';
  context.font = 'bold 17px Courier New, monospace';
  context.fillText('JAM FROG / ' + profiles[look].title.toUpperCase(), 30, 37);
  context.fillText('0' + (scene + 1) + ' / 04', 822, 37);
  context.fillStyle = '#5d8432';
  context.fillRect(0, 58, Math.round(960 * seconds / DURATION), 5);
  context.font = 'bold 45px Trebuchet MS, sans-serif';
  context.fillStyle = '#222820';
  context.fillText(['You play.', 'A next move.', 'The frog answers.', 'Your own sound.'][scene], 42, 180);
  context.font = '22px Trebuchet MS, sans-serif';
  const lines = [
    ['Start with a phrase', 'on your MIDI instrument.'],
    ['Three possible chords.', 'You choose where to go.'],
    ['A reply on the next bar.', 'Keep the conversation going.'],
    ['Your instruments and effects.', 'Your Ableton session.'],
  ][scene];
  context.fillText(lines[0], 42, 235);
  context.fillText(lines[1], 42, 271);
  const chords = scene === 0 ? ['Cmaj7', 'Am7', 'Fmaj7'] : scene === 1 ? ['Am7', 'Fmaj7', 'Dm7'] : ['Dm7', 'G7', 'Cmaj7'];
  chords.forEach((name, i) => {
    context.fillStyle = i === Math.floor(seconds) % 3 ? '#d5f394' : '#f1f4ed';
    context.fillRect(42 + i * 139, 324, 126, 60);
    context.fillStyle = '#222820';
    context.font = 'bold 20px Trebuchet MS, sans-serif';
    context.fillText(name, 55 + i * 139, 362);
  });
  context.fillStyle = '#f0f3ed';
  context.fillRect(510, 93, 416, 374);
  const frame = scene >= 2 ? 8 + Math.floor(seconds * 5) % 8 : 0;
  paintFrog(context, look, frame, { x: 545, y: 111, width: 346, height: 325 });
  context.fillStyle = '#62695e';
  context.font = '14px Courier New, monospace';
  context.fillText('ILLUSTRATED PREVIEW / SILENT / NOT LIVE MIDI', 30, 513);
}
function showVideo(url, generated = false) {
  canvas.hidden = true;
  video.hidden = false;
  video.src = url;
  download.href = url;
  download.download = 'jam-frog-' + look + (generated ? '-preview.webm' : '-demo');
  download.hidden = false;
  playButton.textContent = 'Play again';
  playButton.disabled = false;
}
function captionTrack(name) {
  video.querySelectorAll('track').forEach((track) => track.remove());
  const url = subtitles['./demo-videos/' + name + '.vtt'];
  if (!url) return;
  const track = document.createElement('track');
  track.kind = 'captions';
  track.label = 'English';
  track.srclang = 'en';
  track.src = url;
  track.default = true;
  video.append(track);
}
async function openDemo(name, button) {
  stopPreview();
  look = name;
  opener = button;
  const current = generation;
  document.querySelector('[data-demo-title]').textContent = profiles[name].title;
  document.querySelector('[data-demo-description]').textContent = profiles[name].description;
  download.hidden = true;
  playButton.disabled = true;
  playButton.textContent = 'Loading...';
  video.hidden = true;
  canvas.hidden = false;
  recordedSource = null;
  status.textContent = 'Loading the ' + profiles[name].title + ' preview...';
  context.clearRect(0, 0, canvas.width, canvas.height);
  dialog.showModal();
  try {
    await loadFrog(name);
    if (current !== generation || !dialog.open) return;
    drawFrame(0);
    video.poster = canvas.toDataURL('image/png');
    captionTrack(name);
    const source = recordingFor(name);
    if (source) {
      recordedSource = source;
      document.querySelector('[data-demo-kind]').textContent = 'Recorded genre demo';
      showVideo(source);
      playButton.textContent = 'Play demo';
      status.textContent = 'Recorded ' + profiles[name].title + ' demo.';
    } else {
      document.querySelector('[data-demo-kind]').textContent = 'Animated preview';
      status.textContent = 'A silent illustration. A recorded Ableton demo has not been added for this style yet.';
      playButton.disabled = false;
      playButton.textContent = 'Play preview';
      if (cache.has(name)) showVideo(cache.get(name), true);
      else if (!reducedMotion.matches) playPreview();
    }
  } catch (error) {
    if (current !== generation) return;
    status.textContent = error.message;
    playButton.textContent = 'Retry';
    playButton.disabled = false;
  }
}
function playPreview() {
  if (animation !== null) return;
  if (!video.hidden) {
    video.play().catch(() => { status.textContent = 'Press play in the video player to start.'; });
    return;
  }
  playButton.disabled = true;
  playButton.textContent = 'Playing...';
  const current = generation;
  const selected = look;
  const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((type) => window.MediaRecorder?.isTypeSupported(type));
  if (mimeType && canvas.captureStream) {
    try {
      stream = canvas.captureStream(24);
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => {
        if (current !== generation) return;
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        recorder = null;
        if (!chunks.length) return;
        const url = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
        cache.set(selected, url);
        showVideo(url, true);
        status.textContent = '12-second silent illustrated preview. No Live session or MIDI was recorded.';
      };
      recorder.onerror = () => {
        stream?.getTracks().forEach((track) => track.stop());
        recorder = null;
        stream = null;
      };
      recorder.start();
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      recorder = null;
      stream = null;
    }
  }
  const started = performance.now();
  function animate(now) {
    if (current !== generation || !dialog.open) return;
    const seconds = Math.max(0, Math.min(DURATION, (now - started) / 1000));
    drawFrame(seconds);
    if (seconds < DURATION) animation = requestAnimationFrame(animate);
    else {
      animation = null;
      if (recorder && recorder.state === 'recording') recorder.stop();
      else {
        playButton.disabled = false;
        playButton.textContent = 'Play again';
      }
    }
  }
  animation = requestAnimationFrame(animate);
}
document.querySelectorAll('[data-look]').forEach((button) => {
  button.addEventListener('click', () => openDemo(button.dataset.look, button));
});
playButton.addEventListener('click', () => {
  if (playButton.textContent === 'Retry') openDemo(look, opener);
  else playPreview();
});
video.addEventListener('error', () => {
  if (!recordedSource || !dialog.open) return;
  recordedSource = null;
  video.pause();
  video.hidden = true;
  canvas.hidden = false;
  download.hidden = true;
  drawFrame(0);
  document.querySelector('[data-demo-kind]').textContent = 'Animated preview';
  status.textContent = 'The recording could not play. You can still watch the illustrated preview.';
  playButton.textContent = 'Play preview';
  playButton.disabled = false;
});
document.querySelector('[data-demo-close]').addEventListener('click', () => dialog.close());
document.querySelector('[data-demo-learn]').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
dialog.addEventListener('close', () => { stopPreview(); opener?.focus(); });
window.addEventListener('pagehide', () => {
  stopPreview();
  cache.forEach((url) => URL.revokeObjectURL(url));
  cache.clear();
});
