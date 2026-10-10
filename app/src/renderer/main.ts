import { AnswerEngine, type AnswerProgress } from '../core/answer';
import { detectChord } from '../core/chords';
import { EchoFilter } from '../core/echo';
import { OnsetGrouper, type NoteGroup } from '../core/grouper';
import { buildMidi, keepFileName } from '../core/keep';
import type { ChordModel } from '../core/model';
import { suggest } from '../core/suggest';
import type { AnswerPlan, Chord, FrogMood, NoteEvent, NoteSink, NoteSource, Suggestion } from '../core/types';
import { OscNoteSink, OscNoteSource, onOsc } from './bridges/osc';
import { getMidiAccess, WebMidiNoteSink, WebMidiNoteSource } from './bridges/webmidi';
import { loadModels } from './models';
import { createOverlay, type UiState } from './ui/overlay';

// The app: notes in from Live (Max for Live over OSC, or the IAC ports) -> chord detection -> live
// suggestions; the AnswerEngine answers each 4/8-bar phrase on the frog track. Kevin's overlay draws it all.

// ---- settings (owned here, shown and changed through the overlay) ----

const settings = {
  bridge: 'osc' as 'osc' | 'ports',
  model: 'ngram',
  genre: 'all',
  weirdness: 0.2,
  answersOn: true,
  phraseBars: 4 as 4 | 8,
  bpm: 120,
};

// ---- models: both behind ChordModel; the GRU replaces the n-gram only if it also wins the listening test ----

const models: Record<string, ChordModel> = loadModels();
const model: ChordModel = {
  get name() {
    return models[settings.model].name;
  },
  predictNext: (context, genre) => models[settings.model].predictNext(context, genre),
};

// ---- live state ----

let source: NoteSource | null = null;
let sink: NoteSink | null = null;
let access: MIDIAccess | null = null;
const echo = new EchoFilter();
const history: Chord[] = [];
let suggestions: Suggestion[] = [];
let plan: AnswerPlan | null = null;
let progress: AnswerProgress = { status: 'idle', bar: 0, bars: 4 };
let liveTempo: number | null = null;
let tempoFromLive = false;
let liveBars = 0;
let lastBarAt = -Infinity;
let status = '';

// Everything the frog plays goes through here: echo bookkeeping (ports bridge only), then the bridge.
const frogSink: NoteSink = {
  name: 'frog',
  send(pitch, velocity) {
    if (settings.bridge === 'ports') echo.sent(pitch, velocity, performance.now());
    sink?.send(pitch, velocity);
  },
  close() {},
};

const answers = new AnswerEngine({
  model,
  sink: () => (sink ? frogSink : null),
  settings: () => ({ ...settings }),
  onPlan: (p, pr) => {
    if (pr.status === 'playing' && progress.status !== 'playing') {
      const sinceBar = performance.now() - lastBarAt;
      console.info(sinceBar < 50 ? `[answer] started ${sinceBar.toFixed(0)} ms after Live's bar` : '[answer] started on the frog\'s own bar clock');
    }
    plan = p;
    progress = pr;
    render();
  },
});

const grouper = new OnsetGrouper(onGroup, 60);

function onNote(e: NoteEvent): void {
  // Only the ports bridge can loop the frog's notes back in (a track on "All Ins"); over OSC,
  // filtering would only throw away the player's own notes when they match a frog note.
  if (settings.bridge === 'ports' && echo.isEcho(e)) return;
  grouper.push(e);
  answers.note(e);
}

function onGroup(g: NoteGroup): void {
  const chord = detectChord(g.pitches);
  if (!chord) return; // single notes and non-chords are ignored
  history.push(chord);
  if (history.length > 256) history.shift(); // the whole session; the models only look at the last 8
  answers.chord(chord); // first, so the session key includes this chord
  refreshSuggestions();
}

function refreshSuggestions(): void {
  const last = history[history.length - 1];
  suggestions = last
    ? suggest(history, model, {
        weirdness: settings.weirdness,
        genre: settings.genre,
        lastVoicing: last.pitches,
        key: answers.key(), // the session key, shared with the frog's answers
      })
    : [];
  render();
}

// ---- the overlay ----

const root = document.getElementById('overlay-root')!;
const overlay = createOverlay(root, {
  onWeirdness(v) {
    settings.weirdness = v;
    refreshSuggestions();
  },
  onGenre(g) {
    settings.genre = g;
    refreshSuggestions();
  },
  onAnswersToggle(on) {
    settings.answersOn = on;
    if (!on) answers.cancel();
    render();
  },
  onPhraseBars(bars) {
    settings.phraseBars = bars;
    answers.cancel();
    render();
  },
  onBridge(b) {
    settings.bridge = b;
    connect();
  },
  onBpm(bpm) {
    settings.bpm = bpm;
    render();
  },
  onModel(m) {
    if (m in models) settings.model = m;
    refreshSuggestions();
  },
  onKeep: keep,
});

function mood(): FrogMood {
  if (progress.status === 'listening') return progress.bar >= progress.bars ? 'thinking' : 'listening';
  return 'idle'; // the overlay switches to 'weird' itself (high weirdness or a borrowed suggestion)
}

function uiState(): UiState {
  return {
    mood: mood(),
    current: history.at(-1)?.name ?? null,
    trail: history.slice(-6).map((c) => c.name),
    suggestions,
    answer: plan,
    progress,
    weirdness: settings.weirdness,
    genre: settings.genre,
    phraseBars: settings.phraseBars,
    answersOn: settings.answersOn,
    bridge: settings.bridge,
    bpm: settings.bpm,
    liveTempo,
    bar: liveBars > 0 ? liveBars : null,
    status,
    musicPlaying: progress.status === 'playing',
    model: settings.model,
  };
}

// Notes, bars and plans can arrive many times a frame; draw at most once per frame.
let frame: number | null = null;
function render(): void {
  if (frame !== null) return;
  frame = requestAnimationFrame(() => {
    frame = null;
    overlay.update(uiState());
  });
}

function setStatus(text: string): void {
  status = text;
  render();
}

// ---- Keep ----

async function keep(): Promise<void> {
  const { phrase, answer } = answers.keepNotes();
  if (!phrase.some((e) => e.velocity > 0)) return setStatus('Play a phrase first, then Keep it.');
  try {
    const saved = await window.jamFrog.saveMidi(buildMidi(phrase, answer, settings.bpm), keepFileName());
    setStatus(saved ? `Kept ${saved.split('/').pop()}` : '');
  } catch (err) {
    setStatus(`Could not save: ${String(err)}`);
  }
}

// ---- bridges ----

const portByName = (ports: Iterable<MIDIPort>, name: string) => [...ports].find((p) => (p.name ?? '').includes(name));

function connect(): void {
  source?.close();
  answers.cancel();
  sink?.close();
  source = null;
  sink = null;
  status = '';
  if (settings.bridge === 'osc') {
    source = new OscNoteSource();
    sink = new OscNoteSink();
  } else if (!access) {
    status = 'MIDI ports unavailable';
  } else {
    // The ports bridge uses the IAC buses named in ableton/SETUP.md.
    const input = portByName(access.inputs.values(), 'JamFrog In') as MIDIInput | undefined;
    const output = portByName(access.outputs.values(), 'JamFrog Out') as MIDIOutput | undefined;
    source = input ? new WebMidiNoteSource(input) : null;
    sink = output ? new WebMidiNoteSink(output) : null;
    if (!input || !output) status = 'Need IAC ports "JamFrog In" and "JamFrog Out" (ableton/SETUP.md)';
  }
  source?.onNote(onNote);
  render();
}

async function initPorts(): Promise<void> {
  try {
    access = await getMidiAccess();
  } catch (err) {
    if (settings.bridge === 'ports') setStatus(`MIDI unavailable: ${String(err)}`);
    return;
  }
  const a = access;
  // Reconnect only when ports are added or removed, not when one merely opens.
  const portsKey = () => [...a.inputs.values(), ...a.outputs.values()].map((p) => `${p.id}:${p.state}`).join('|');
  let lastKey = portsKey();
  a.onstatechange = () => {
    const key = portsKey();
    if (key !== lastKey) {
      lastKey = key;
      if (settings.bridge === 'ports') connect();
    }
  };
  if (settings.bridge === 'ports') connect();
}

// Transport info from Frog Voice: /tempo <bpm> and /bar at every bar start.
onOsc((msg) => {
  if (msg[0] === '/tempo') {
    tempoFromLive = true;
    const bpm = Math.round(Number(msg[1]) * 100) / 100;
    settings.bpm = bpm;
    liveTempo = bpm;
    render();
  } else if (msg[0] === '/bar') {
    const now = performance.now();
    // Frog Voice only sends /tempo when it loads or the tempo changes. If the app started later and never
    // got it, take the BPM from the bar length (assumes 4/4) so the BPM isn't left wrong.
    const gap = now - lastBarAt;
    if (!tempoFromLive && gap > 250 && gap < 10000) {
      settings.bpm = Math.round(240000 / gap);
      liveTempo = settings.bpm;
    }
    lastBarAt = now;
    liveBars++;
    answers.bar();
    render();
  }
});
window.jamFrog.osc.onError((text) => setStatus(`OSC: ${text}`));

window.addEventListener('beforeunload', () => {
  answers.cancel();
  sink?.close();
});

connect();
initPorts();
render();
