import './frog-looks.js';
import './demo-video.js';

const modes = {
  suggest: { number: '01', title: 'A little nudge forward.', copy: 'Get three possible next chords based on your playing, key, genre, and weirdness setting. Choose the one that sounds like you.', label: 'THREE NEXT MOVES', note: 'FROG SUGGESTS', familiar: ['Am7', 'Fmaj7', 'Dm7'], adventurous: ['Abmaj7', 'E7', 'Fm'] },
  answer: { number: '02', title: 'Your phrase. A new reply.', copy: 'Play 2, 4, or 8 bars. The frog answers on the next downbeat, with voicings near your hands and optional rhythm copying.', label: 'FROG RESPONSE', note: 'NEXT DOWNBEAT', familiar: ['Dm7', 'G7', 'Cmaj7', 'Cmaj7'], adventurous: ['Dm7', 'Abmaj7', 'G7', 'Cmaj7'] },
  jam: { number: '03', title: 'A bandmate that keeps going.', copy: 'Keep improvising over new phrases. The frog previews its next block and follows your key changes. Turning weirdness can reshape the next planned block.', label: 'NEXT JAM PHRASE', note: 'PLAY ALONG', familiar: ['Cmaj7', 'Am7', 'Dm7', 'G7'], adventurous: ['Cmaj7', 'E7', 'Am7', 'Abmaj7'] },
};
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const weirdness = document.querySelector('#weirdness');
const chords = document.querySelector('[data-frog-chords]');
let selectedMode = 'suggest';

function updateExample() {
  const mode = modes[selectedMode];
  document.querySelector('[data-mode-number]').textContent = mode.number;
  document.querySelector('[data-mode-title]').textContent = mode.title;
  document.querySelector('[data-mode-copy]').textContent = mode.copy;
  const note = document.createElement('span');
  note.textContent = mode.note;
  document.querySelector('[data-phrase-label]').replaceChildren(mode.label, note);
  const choices = Number(weirdness.value) >= 60 ? mode.adventurous : mode.familiar;
  chords.style.gridTemplateColumns = 'repeat(' + choices.length + ', minmax(0, 1fr))';
  chords.replaceChildren(...choices.map((name) => {
    const cell = document.createElement('span');
    cell.textContent = name;
    return cell;
  }));
  document.querySelector('#weirdness-value').textContent = weirdness.value + '%';
  modeButtons.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.mode === selectedMode)));
}
modeButtons.forEach((button) => button.addEventListener('click', () => {
  selectedMode = button.dataset.mode;
  updateExample();
}));
weirdness.addEventListener('input', updateExample);
updateExample();

const artwork = import.meta.glob('../docs/art/**/*.{png,jpg,jpeg,webp,avif,svg}', { eager: true, query: '?url', import: 'default' });
const artFiles = Object.keys(artwork).sort((a, b) => {
  const preferred = (path) => /\/jam-frog\./i.test(path) ? 0 : 1;
  return preferred(a) - preferred(b) || a.localeCompare(b);
});
if (artFiles.length) {
  const image = document.querySelector('[data-project-art]');
  image.addEventListener('load', () => { document.querySelector('[data-closing-art]').hidden = false; });
  image.src = artwork[artFiles[0]];
}
