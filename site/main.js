const steps = [
  {
    kicker: 'PLAYER INPUT',
    title: 'Start with the chords you play.',
    copy: 'Frog Ear sends note-on and note-off events from your Live instrument track to Jam Frog over localhost OSC.',
    link: 'Read the Ableton routing guide',
    href: 'https://github.com/AlexS-127/jam-frog/blob/main/ableton/SETUP.md',
  },
  {
    kicker: 'LOCAL PREDICTION',
    title: 'Review a few possible next chords.',
    copy: 'OnsetGrouper collects the notes; detectChord names the chord. The selected local model suggests candidates, then genre, key and the weirdness control reshape their ranking.',
    link: 'Read suggestion ranking',
    href: 'https://github.com/AlexS-127/jam-frog/blob/main/app/src/core/suggest.ts',
  },
  {
    kicker: 'CALL AND RESPONSE',
    title: 'Invite a phrase in reply.',
    copy: 'AnswerEngine plans a continuation for the next bar and voices it near your register. Copy My Rhythm can reuse your note timing, lengths, re-strikes and dynamics.',
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
  jazz: 'Jazz look selected. Choose Play to preview its instrument animation.',
  rock: 'Rock look selected. Choose Play to preview its instrument animation.',
  punk: 'Punk look selected. Choose Play to preview its instrument animation.',
  alternative: 'Alternative look selected. Choose Play to preview its instrument animation.',
  pop: 'Pop look selected. Choose Play to preview its instrument animation.',
  country: 'Country look selected. Choose Play to preview its instrument animation.',
  electronic: 'Electronic look selected. Choose Play to preview its instrument animation.',
  rap: 'Rap look selected. Choose Play to preview its instrument animation.',
};

lookButtons.forEach((button) => {
  button.addEventListener('click', () => {
    lookButtons.forEach((item) => {
      const selected = item === button;
      item.classList.toggle('is-selected', selected);
      item.setAttribute('aria-pressed', String(selected));
    });
    window.dispatchEvent(new CustomEvent('frog-look-selected', { detail: button.dataset.look }));
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
