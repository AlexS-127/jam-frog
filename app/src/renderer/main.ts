import { AnswerEngine, type AnswerProgress } from '../core/answer';
import { detectChord } from '../core/chords';
import { EchoFilter } from '../core/echo';
import { NgramModel } from '../core/ngram';
import { suggest } from '../core/suggest';
import type { AnswerPlan, Chord } from '../core/types';
import { GENRES } from '../core/vocab';
import ngramText from '../../../model/export/ngram.json?raw';
import type { NgramJson } from '../core/ngram';
import { OnsetGrouper, type NoteGroup } from '../core/grouper';
import type { NoteEvent, NoteSink, NoteSource } from '../core/types';
import { OscNoteSink, OscNoteSource, onOsc } from './bridges/osc';
import { getMidiAccess, WebMidiNoteSink, WebMidiNoteSource } from './bridges/webmidi';

// Dev overlay: chord in from Live -> name it -> live suggestions; after a pause the frog answers.
// Bridge is either the Max for Live devices (OSC) or the IAC ports (Web MIDI).
// Kevin's overlay UI (lane B) replaces the DOM code here.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const inputSel = $<HTMLSelectElement>('input');
const outputSel = $<HTMLSelectElement>('output');
const bpmInput = $<HTMLInputElement>('bpm');
const bridgeSel = $<HTMLSelectElement>('bridge');
const genreSel = $<HTMLSelectElement>('genre');
const weirdInput = $<HTMLInputElement>('weird');
const answersOn = $<HTMLInputElement>('answersOn');
const phraseSel = $<HTMLSelectElement>('phrase');

const model = new NgramModel(JSON.parse(ngramText) as NgramJson);
const history: Chord[] = [];
for (const g of ['all', ...GENRES]) genreSel.add(new Option(g, g));
weirdInput.oninput = () => {
  $('weirdVal').textContent = Number(weirdInput.value).toFixed(2);
  showSuggestions();
};
genreSel.onchange = () => showSuggestions();
const status = $('status');

let source: NoteSource | null = null;
let sink: NoteSink | null = null;
const echo = new EchoFilter();
const held = new Set<number>();
const counts = { in: 0, out: 0, doubled: 0 };
let lastBarAt = -Infinity;

// Everything the frog plays goes through here: echo bookkeeping, counters, then the current bridge.
const frogSink: NoteSink = {
  name: 'frog',
  send: (pitch, velocity) => send(pitch, velocity),
  close: () => {},
};

const answers = new AnswerEngine({
  model,
  sink: () => (sink ? frogSink : null),
  settings: () => ({
    answersOn: answersOn.checked,
    weirdness: Number(weirdInput.value),
    genre: genreSel.value,
    bpm: Number(bpmInput.value) || 120,
    phraseBars: Number(phraseSel.value) || 4,
  }),
  onPlan: showAnswer,
});
answersOn.onchange = () => {
  if (!answersOn.checked) answers.cancel();
};
phraseSel.onchange = () => answers.cancel();

const grouper = new OnsetGrouper(onGroup, 60);

function onNote(e: NoteEvent): void {
  // Only the ports bridge can loop the frog's notes back in (a track on "All Ins"); over OSC,
  // filtering would only throw away the player's own notes when they match a frog note.
  if (bridgeSel.value === 'ports' && echo.isEcho(e)) return render();
  if (e.velocity > 0) {
    counts.in++;
    if (held.has(e.pitch)) counts.doubled++; // a second note-on without a note-off: doubled routing
    held.add(e.pitch);
  } else {
    held.delete(e.pitch);
  }
  grouper.push(e);
  answers.note(e);
  render();
}

function onGroup(g: NoteGroup): void {
  const chord = detectChord(g.pitches);
  if (!chord) return; // single notes and non-chords are ignored
  $('chord').textContent = chord.name;
  history.push(chord);
  if (history.length > 16) history.shift();
  const t0 = performance.now(); // chord recognised (the 60 ms grouping window has closed)
  showSuggestions();
  $('suggestMs').textContent = `${(performance.now() - t0).toFixed(1)} ms`;
  $('latency').textContent = `${Math.round(performance.now() - g.firstTime)} ms`;
  answers.chord(chord);
}

let wasPlaying = false;

function showAnswer(plan: AnswerPlan | null, p: AnswerProgress): void {
  $('answer').textContent = plan ? plan.chords.map((c) => c.name).join(' → ') : '—';
  $('answerStatus').textContent =
    p.status === 'listening' ? ` · your phrase, bar ${p.bar}/${p.bars}` : p.status === 'playing' ? ` · playing, bar ${p.bar}/${p.bars}` : '';
  // How far after Live's bar line the answer started (only meaningful while the transport runs).
  if (p.status === 'playing' && !wasPlaying) {
    const sinceBar = performance.now() - lastBarAt;
    $('barLag').textContent = sinceBar < 50 ? `${sinceBar.toFixed(0)} ms after Live's bar` : 'on the frog\'s own bar clock';
  }
  wasPlaying = p.status === 'playing';
}

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
// Ableton naming: MIDI 60 = C3
const noteName = (p: number) => `${NOTE_NAMES[p % 12]}${Math.floor(p / 12) - 2}`;

function showSuggestions(): void {
  const last = history[history.length - 1];
  const list = suggest(history, model, {
    weirdness: Number(weirdInput.value),
    genre: genreSel.value,
    lastVoicing: last?.pitches,
  });
  const box = $('suggestions');
  box.innerHTML = '';
  for (const s of list) {
    const el = document.createElement('div');
    el.className = s.borrowed ? 'sugg borrowed' : 'sugg';
    el.title = `${Math.round(s.prob * 100)}%${s.borrowed ? ' · borrowed' : ''}`;
    el.innerHTML = `<b>${s.name}</b><small>${s.voicing.map(noteName).join(' ')}</small>`;
    box.append(el);
  }
}

function send(pitch: number, velocity: number): void {
  if (bridgeSel.value === 'ports') echo.sent(pitch, velocity, performance.now());
  sink?.send(pitch, velocity);
  if (velocity > 0) counts.out++;
  render();
}

function render(): void {
  $('in').textContent = String(counts.in);
  $('out').textContent = String(counts.out);
  $('doubled').textContent = String(counts.doubled);
  $('echo').textContent = String(echo.ignored);
}

function fillSelect(sel: HTMLSelectElement, ports: MIDIPort[], prefer: string): void {
  const prev = sel.value;
  sel.innerHTML = '';
  for (const p of ports) sel.add(new Option(p.name ?? p.id, p.id));
  const ids = ports.map((p) => p.id);
  const preferred = ports.find((p) => (p.name ?? '').includes(prefer));
  sel.value = ids.includes(prev) ? prev : (preferred?.id ?? '');
}

let access: MIDIAccess | null = null;

function connect(): void {
  source?.close();
  answers.cancel();
  sink?.close();
  held.clear();
  source = null;
  sink = null;
  const bridge = bridgeSel.value;
  document.body.dataset.bridge = bridge;
  status.textContent = '';

  if (bridge === 'osc') {
    source = new OscNoteSource();
    sink = new OscNoteSink();
  } else {
    if (!access) {
      status.textContent = 'MIDI unavailable';
      return;
    }
    const input = access.inputs.get(inputSel.value);
    const output = access.outputs.get(outputSel.value);
    source = input ? new WebMidiNoteSource(input) : null;
    sink = output ? new WebMidiNoteSink(output) : null;
    if (input && output && input.name === output.name) {
      status.textContent = 'Input and output are the same port — notes will loop.';
    } else if (!input || !output) {
      status.textContent = 'Pick "JamFrog In" and "JamFrog Out" (see ableton/SETUP.md).';
    }
  }
  source?.onNote(onNote);
}

async function initPorts(): Promise<void> {
  try {
    access = await getMidiAccess();
  } catch (err) {
    if (bridgeSel.value === 'ports') status.textContent = `MIDI unavailable: ${String(err)}`;
    return;
  }
  const a = access;
  const refresh = () => {
    fillSelect(inputSel, [...a.inputs.values()], 'JamFrog In');
    fillSelect(outputSel, [...a.outputs.values()], 'JamFrog Out');
    if (bridgeSel.value === 'ports') connect();
  };
  // Re-list only when ports are added or removed, not when one merely opens.
  const portsKey = () =>
    [...a.inputs.values(), ...a.outputs.values()].map((p) => `${p.id}:${p.state}`).join('|');
  let lastKey = portsKey();
  a.onstatechange = () => {
    const key = portsKey();
    if (key !== lastKey) {
      lastKey = key;
      refresh();
    }
  };
  inputSel.onchange = connect;
  outputSel.onchange = connect;
  refresh();
}

// Transport info from Frog Voice: /tempo <bpm> and /bar at every bar start.
let bars = 0;
onOsc((msg) => {
  if (msg[0] === '/tempo') {
    const bpm = Math.round(Number(msg[1]) * 100) / 100;
    bpmInput.value = String(bpm);
    $('liveTempo').textContent = `${bpm} BPM`;
  } else if (msg[0] === '/bar') {
    lastBarAt = performance.now();
    answers.bar();
    $('bar').textContent = String(++bars);
  }
});
window.jamFrog.osc.onError((text) => (status.textContent = `OSC: ${text}`));

bridgeSel.onchange = connect;
$('close').onclick = () => {
  answers.cancel();
  window.close();
};
window.addEventListener('beforeunload', () => {
  answers.cancel();
  sink?.close();
});

connect();
initPorts();
