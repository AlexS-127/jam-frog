import { chordName, detectChord, QUALITY_INTERVALS } from '../core/chords';
import { EchoFilter } from '../core/echo';
import { NgramModel } from '../core/ngram';
import { suggest } from '../core/suggest';
import type { Chord } from '../core/types';
import { GENRES } from '../core/vocab';
import ngramText from '../../../model/export/ngram.json?raw';
import type { NgramJson } from '../core/ngram';
import { OnsetGrouper, type NoteGroup } from '../core/grouper';
import type { NoteEvent, NoteSink, NoteSource } from '../core/types';
import { OscNoteSink, OscNoteSource, onOsc } from './bridges/osc';
import { getMidiAccess, WebMidiNoteSink, WebMidiNoteSource } from './bridges/webmidi';

// Spike: chord in from Live -> name it -> play its IV chord on the frog track.
// Bridge is either the Max for Live devices (OSC) or the IAC ports (Web MIDI).

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const inputSel = $<HTMLSelectElement>('input');
const outputSel = $<HTMLSelectElement>('output');
const bpmInput = $<HTMLInputElement>('bpm');
const bridgeSel = $<HTMLSelectElement>('bridge');
const genreSel = $<HTMLSelectElement>('genre');
const weirdInput = $<HTMLInputElement>('weird');

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
let sounding: number[] = [];
let releaseTimer: ReturnType<typeof setTimeout> | null = null;

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
  const ivRoot = (chord.root + 5) % 12;
  $('answer').textContent = chordName(ivRoot, 'maj');
  playChord(QUALITY_INTERVALS.maj.map((i) => 60 + ivRoot + i));
  $('latency').textContent = `${Math.round(performance.now() - g.firstTime)} ms`;
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

function playChord(pitches: number[]): void {
  if (!sink) return;
  releaseAll();
  for (const p of pitches) send(p, 90);
  sounding = pitches;
  const beatMs = 60000 / (Number(bpmInput.value) || 120);
  releaseTimer = setTimeout(releaseAll, 2 * beatMs);
}

function releaseAll(): void {
  if (releaseTimer) clearTimeout(releaseTimer);
  releaseTimer = null;
  for (const p of sounding) send(p, 0);
  sounding = [];
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
  releaseAll();
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
    $('bar').textContent = String(++bars);
  }
});
window.jamFrog.osc.onError((text) => (status.textContent = `OSC: ${text}`));

bridgeSel.onchange = connect;
$('close').onclick = () => {
  releaseAll();
  window.close();
};
window.addEventListener('beforeunload', () => {
  releaseAll();
  sink?.close();
});

connect();
initPorts();
