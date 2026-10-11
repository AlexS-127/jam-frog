const steps = [
  {
    kicker: 'PLAYER INPUT',
    title: 'Start with the chords you play.',
    copy: 'Frog Ear sends note-on and note-off events from your Live instrument track to Jam Frog over localhost OSC. The IAC virtual MIDI ports are a fallback.',
    link: 'Read the Ableton routing guide',
    href: 'https://github.com/AlexS-127/jam-frog/blob/main/ableton/SETUP.md',
  },
  {
    kicker: 'LOCAL PREDICTION',
    title: 'See three ways forward.',
    copy: 'The app groups the note-ons into a chord, estimates the session key, then ranks three model suggestions. Genre and the weirdness control reshape that distribution.',
    link: 'Read suggestion ranking',
    href: 'https://github.com/AlexS-127/jam-frog/blob/main/app/src/core/suggest.ts',
  },
  {
    kicker: 'CALL AND RESPONSE',
    title: 'The frog takes a turn.',
    copy: 'At the next bar line, AnswerEngine plays a 2–4 chord continuation in your register. With Copy my rhythm on, it can use up to 8 chords and mirror note timing, lengths, and dynamics.',
    link: 'Read the answer engine',
    href: 'https://github.com/AlexS-127/jam-frog/blob/main/app/src/core/answer.ts',
  },
];

const buttons = [...document.querySelectorAll('[data-step]')];
const kicker = document.querySelector('[data-signal-kicker]');
const title = document.querySelector('[data-signal-title]');
const copy = document.querySelector('[data-signal-copy]');
const link = document.querySelector('[data-signal-link]');

function selectStep(index) {
  const step = steps[index];
  if (!step) return;
  buttons.forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  kicker.textContent = step.kicker;
  title.textContent = step.title;
  copy.textContent = step.copy;
  link.textContent = `${step.link} ↗`;
  link.href = step.href;
}

buttons.forEach((button) => {
  button.addEventListener('click', () => selectStep(Number(button.dataset.step)));
});

const lookButtons = [...document.querySelectorAll('[data-look]')];
const lookAnnouncement = document.querySelector('[data-look-announcement]');
const lookMessages = {
  jazz: 'Jazz frog is ready to sit in. Try another look.',
  rock: 'Rock frog is ready to turn up the amp.',
  country: 'Country frog is ready to ride the changes.',
  electronic: 'Electronic frog is ready to find the pulse.',
};

lookButtons.forEach((button) => {
  button.addEventListener('click', () => {
    lookButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.classList.remove('is-changing');
      item.setAttribute('aria-pressed', String(selected));
      item.querySelector('.look-status').textContent = selected ? 'SELECTED' : 'SELECT';
    });
    window.setTimeout(() => button.classList.add('is-changing'), 0);
    window.setTimeout(() => button.classList.remove('is-changing'), 420);
    lookAnnouncement.textContent = lookMessages[button.dataset.look];
  });
});

document.addEventListener('keydown', (event) => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (!buttons.includes(document.activeElement)) return;
  const activeIndex = buttons.findIndex((button) => button.getAttribute('aria-pressed') === 'true');
  if (activeIndex < 0) return;
  const next = (activeIndex + (event.key === 'ArrowRight' ? 1 : -1) + steps.length) % steps.length;
  buttons[next].focus();
  selectStep(next);
});
