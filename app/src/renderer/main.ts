import { chordName, detectChord, QUALITY_INTERVALS } from '../core/chords';
import { EchoFilter } from '../core/echo';
import { OnsetGrouper, type NoteGroup } from '../core/grouper';
import type { NoteEvent, NoteSink, NoteSource } from '../core/types';
import { getMidiAccess, WebMidiNoteSink, WebMidiNoteSource } from './bridges/webmidi';

// Spike: chord in from "JamFrog In" -> name it -> play its IV chord out to "JamFrog Out".

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const inputSel = $<HTMLSelectElement>('input');
const outputSel = $<HTMLSelectElement>('output');
const bpmInput = $<HTMLInputElement>('bpm');
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
  if (echo.isEcho(e)) return render();
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
  const ivRoot = (chord.root + 5) % 12;
  $('answer').textContent = chordName(ivRoot, 'maj');
  playChord(QUALITY_INTERVALS.maj.map((i) => 60 + ivRoot + i));
  $('latency').textContent = `${Math.round(performance.now() - g.firstTime)} ms`;
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
  echo.sent(pitch, velocity, performance.now());
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

async function init(): Promise<void> {
  let access: MIDIAccess;
  try {
    access = await getMidiAccess();
  } catch (err) {
    status.textContent = `MIDI unavailable: ${String(err)}`;
    return;
  }

  const connect = () => {
    source?.close();
    releaseAll();
    sink?.close();
    held.clear();
    const input = access.inputs.get(inputSel.value);
    const output = access.outputs.get(outputSel.value);
    source = input ? new WebMidiNoteSource(input) : null;
    sink = output ? new WebMidiNoteSink(output) : null;
    source?.onNote(onNote);
    if (input && output && input.name === output.name) {
      status.textContent = 'Input and output are the same port — notes will loop.';
    } else if (!input || !output) {
      status.textContent = 'Pick "JamFrog In" and "JamFrog Out" (see ableton/SETUP.md).';
    } else {
      status.textContent = '';
    }
  };

  const refresh = () => {
    fillSelect(inputSel, [...access.inputs.values()], 'JamFrog In');
    fillSelect(outputSel, [...access.outputs.values()], 'JamFrog Out');
    connect();
  };

  // Re-list only when ports are added or removed, not when one merely opens.
  const portsKey = () =>
    [...access.inputs.values(), ...access.outputs.values()].map((p) => `${p.id}:${p.state}`).join('|');
  let lastKey = portsKey();
  access.onstatechange = () => {
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

$('close').onclick = () => {
  releaseAll();
  window.close();
};
window.addEventListener('beforeunload', () => {
  releaseAll();
  sink?.close();
});

init();
