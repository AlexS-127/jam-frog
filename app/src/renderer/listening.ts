import { buildCases, tally, type ListeningCase, type Vote } from '../core/listening';
import type { NoteSink } from '../core/types';
import { OscNoteSink } from './bridges/osc';
import { getMidiAccess, WebMidiNoteSink } from './bridges/webmidi';
import { loadModels } from './models';

// Feature 8: blind A/B listening test of the n-gram against the GRU (see core/listening.ts).
// Votes live only in this page (no storage); "Copy results" puts them on the clipboard.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bridgeSel = $<HTMLSelectElement>('bridge');
const bpmInput = $<HTMLInputElement>('bpm');
const status = $('status');
const LETTERS = 'ABCD';

const cases: ListeningCase[] = buildCases(loadModels());
const votes = new Map<string, Vote>();

// ---- playback: the call, a short gap, then one answer; one chord per 2 beats ----

let sink: NoteSink | null = null;
let playing: { timers: ReturnType<typeof setTimeout>[]; sounding: Set<number>; button: HTMLButtonElement } | null = null;

async function getSink(): Promise<NoteSink | null> {
  if (sink) return sink;
  if (bridgeSel.value === 'osc') return (sink = new OscNoteSink());
  try {
    const access = await getMidiAccess();
    const out = [...access.outputs.values()].find((o) => (o.name ?? '').includes('JamFrog Out'));
    if (!out) status.textContent = 'No "JamFrog Out" port (see ableton/SETUP.md)';
    return (sink = out ? new WebMidiNoteSink(out) : null);
  } catch (err) {
    status.textContent = `MIDI unavailable: ${String(err)}`;
    return null;
  }
}

function stop(): void {
  if (!playing) return;
  playing.timers.forEach(clearTimeout);
  for (const p of playing.sounding) sink?.send(p, 0);
  playing.button.classList.remove('playing');
  playing = null;
}

async function play(c: ListeningCase, option: number, button: HTMLButtonElement): Promise<void> {
  stop();
  const out = await getSink();
  if (!out) return;
  const beat = 60000 / (Number(bpmInput.value) || 110);
  const steps = [
    ...c.call.map((ch) => ({ pitches: ch.pitches, velocity: 70 })),
    null, // a beat of breath between call and answer
    ...c.options[option].plan.chords.map((ch) => ({ pitches: ch.voicing, velocity: 90 })),
  ];
  const run = { timers: [] as ReturnType<typeof setTimeout>[], sounding: new Set<number>(), button };
  playing = run;
  button.classList.add('playing');
  let t = 0;
  for (const step of steps) {
    run.timers.push(setTimeout(() => {
      for (const p of run.sounding) out.send(p, 0);
      run.sounding.clear();
      for (const p of step?.pitches ?? []) {
        out.send(p, step!.velocity);
        run.sounding.add(p);
      }
    }, t));
    t += step ? 2 * beat : beat;
  }
  run.timers.push(setTimeout(stop, t));
}

// ---- the table ----

const tbody = $('cases');
for (const c of cases) {
  const tr = document.createElement('tr');
  const listen = document.createElement('td');
  listen.className = 'listen';
  const vote = document.createElement('td');
  vote.className = 'vote';
  c.options.forEach((_, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `▶ ${LETTERS[i]}`;
    b.onclick = () => (playing?.button === b ? stop() : play(c, i, b));
    listen.append(b);
  });
  for (const [label, value] of [...c.options.map((_, i) => [LETTERS[i], i] as const), ['tie', 'tie'] as const]) {
    const l = document.createElement('label');
    const r = document.createElement('input');
    r.type = 'radio';
    r.name = `vote-${c.id}`;
    r.onchange = () => {
      votes.set(c.id, value);
      showTally();
    };
    l.append(r, ` ${label}`);
    vote.append(l);
  }
  const answers = document.createElement('td');
  answers.className = 'answers';
  answers.innerHTML = c.options
    .map((o, i) => `${LETTERS[i]} = <b>${o.model}</b>: ${o.plan.chords.map((ch) => ch.name).join(' ')}`)
    .join('<br>');
  tr.innerHTML = `<td class="prog">${c.progression}</td><td>${c.weirdness}</td>`;
  tr.append(listen, vote, answers);
  tbody.append(tr);
}

function showTally(): void {
  const t = tally(cases, votes);
  const revealed = document.body.classList.contains('revealed');
  const line = (counts: Record<string, number>) =>
    Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ');
  $('tally').textContent = revealed
    ? `Voted ${t.voted}/${t.total}\nOverall: ${line(t.overall)}\n` +
      Object.entries(t.byWeirdness).map(([w, counts]) => `Weirdness ${w}: ${line(counts)}`).join('\n')
    : `Voted ${t.voted}/${t.total}. Reveal when everyone has voted.`;
}

$('reveal').onclick = () => {
  document.body.classList.toggle('revealed');
  showTally();
};
$('copy').onclick = async () => {
  const rows = cases.map((c) => {
    const v = votes.get(c.id);
    const pick = v === undefined ? '-' : v === 'tie' ? 'tie' : c.options[v].model;
    return `${c.progression} | w=${c.weirdness} | vote: ${pick} | ${c.options.map((o) => `${o.model}: ${o.plan.chords.map((ch) => ch.name).join(' ')}`).join(' | ')}`;
  });
  const t = tally(cases, votes);
  await navigator.clipboard.writeText([...rows, '', `overall: ${JSON.stringify(t.overall)}`].join('\n'));
  status.textContent = 'Results copied';
};
$('stop').onclick = stop;
bridgeSel.onchange = () => {
  stop();
  sink?.close();
  sink = null;
};
window.addEventListener('beforeunload', () => {
  stop();
  sink?.close();
});
showTally();
