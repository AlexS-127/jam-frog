import { AnswerEngine, type AnswerProgress, type JamLog } from '../core/answer';
import { detectChord } from '../core/chords';
import { OnsetGrouper, type NoteGroup } from '../core/grouper';
import { keyName } from '../core/key';
import type { ChordModel } from '../core/model';
import { analyseJam, geminiRequest, localReport, parseGeminiReport, type JamReport } from '../core/report';
import { suggest } from '../core/suggest';
import type { AnswerPlan, Chord, FrogMood, NoteEvent, Suggestion } from '../core/types';
import { OscNoteSink, OscNoteSource, onOsc } from './bridges/osc';
import { loadModels } from './models';
import { createOverlay, type FrogMode, type ReportMode, type UiState } from './ui/overlay';

// The app: notes in from Live (Frog Ear, Max for Live, over OSC) -> chord detection -> suggestions in the
// frog's speech bubble; the AnswerEngine answers each 2/4/8-bar phrase on the frog track (Frog Voice).

// ---- settings (owned here, shown and changed through the overlay) ----

const settings = {
  model: 'gru',
  genre: 'all',
  weirdness: 0.2,
  frogMode: 'answer' as FrogMode,
  phraseBars: 4 as 2 | 4 | 8,
  bpm: 120,
  rhythm: false,
  /** the jam report: written by Gemini (if there is an API key), or on this Mac only */
  reportMode: 'gemini' as ReportMode,
};

// ---- models: both behind ChordModel ----

const models: Record<string, ChordModel> = loadModels();
const model: ChordModel = {
  get name() {
    return models[settings.model].name;
  },
  predictNext: (context, genre) => models[settings.model].predictNext(context, genre),
};

// ---- live state ----

const source = new OscNoteSource();
const sink = new OscNoteSink();
const history: Chord[] = [];
let suggestions: Suggestion[] = [];
let plan: AnswerPlan | null = null;
let progress: AnswerProgress = { status: 'idle', bar: 0, bars: 4, chord: -1 };
let liveTempo: number | null = null;
let tempoFromLive = false;
let liveBars = 0;
let lastBarAt = -Infinity;
let status = '';
let report: JamReport | null = null;
let reportPending = false;
let reportBubble = false;
let reportSeq = 0;
let geminiAvailable = false;
/** how long the frog announces a key change */
const KEY_CHANGE_MS = 4000;
let keyChangeTimer: ReturnType<typeof setTimeout> | null = null;
let shownKeyChange = 0;

window.jamFrog.gemini.available().then((ok) => {
  geminiAvailable = ok;
  render();
});

const answers = new AnswerEngine({
  model,
  sink: () => sink,
  settings: () => ({ ...settings, answersOn: settings.frogMode !== 'off', continuous: settings.frogMode === 'jam' }),
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
  grouper.push(e);
  answers.note(e);
}

function onGroup(g: NoteGroup): void {
  const chord = detectChord(g.pitches);
  if (!chord) return; // single notes and non-chords are ignored
  reportBubble = false; // the frog stops talking about the last jam once you play again
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

source.onNote(onNote);

// ---- the overlay ----

const overlay = createOverlay(document.getElementById('overlay-root')!, {
  onWeirdness(v) {
    settings.weirdness = v;
    refreshSuggestions();
  },
  onGenre(g) {
    settings.genre = g;
    refreshSuggestions();
  },
  onFrogMode(mode) {
    settings.frogMode = mode;
    answers.cancel(); // switching mode stops whatever the frog was doing
    render();
  },
  onStop() {
    const log = answers.stop();
    if (log) void makeReport(log);
    render();
  },
  onPhraseBars(bars) {
    settings.phraseBars = bars;
    answers.cancel();
    render();
  },
  onRhythm(on) {
    settings.rhythm = on;
    render();
  },
  onModel(m) {
    if (m in models) settings.model = m;
    refreshSuggestions();
  },
  onBpm(bpm) {
    settings.bpm = bpm;
    render();
  },
  onReportMode(mode) {
    settings.reportMode = mode;
    render();
  },
});

/**
 * After a jam: the frog sums it up at once from the local analysis, or, with Gemini on, asks Gemini for a
 * livelier write-up first (the local report stays if Gemini fails or takes too long).
 */
async function makeReport(log: JamLog): Promise<void> {
  const seq = ++reportSeq;
  const analysis = analyseJam(log);
  report = localReport(analysis);
  reportBubble = true;
  reportPending = geminiAvailable && settings.reportMode === 'gemini';
  render();
  if (!reportPending) return;
  const { response, error } = await window.jamFrog.gemini.generate(geminiRequest(analysis));
  if (seq !== reportSeq) return; // a newer jam's report took over
  const written = response ? parseGeminiReport(response, analysis) : null;
  if (written) report = written;
  else status = `Jam report: ${error ?? 'Gemini gave no usable answer'} (written locally instead)`;
  reportPending = false;
  render();
}

/** The latest key change, while it is still news (a few seconds). */
function recentKeyChange(): UiState['keyChange'] {
  const change = answers.keyCentre().change;
  if (!change || performance.now() - change.at > KEY_CHANGE_MS) return null;
  if (change.at !== shownKeyChange) {
    shownKeyChange = change.at;
    if (keyChangeTimer) clearTimeout(keyChangeTimer);
    keyChangeTimer = setTimeout(render, KEY_CHANGE_MS - (performance.now() - change.at) + 20);
  }
  return { from: keyName(change.from), to: keyName(change.to) };
}

function mood(): FrogMood {
  if (progress.status === 'listening') return progress.bar >= progress.bars ? 'thinking' : 'listening';
  return 'idle'; // the overlay switches to 'weird' itself (high weirdness or a borrowed suggestion)
}

function uiState(): UiState {
  return {
    mood: mood(),
    phase: progress.status,
    bar: progress.bar,
    bars: progress.bars,
    yourChords: answers.phraseCells(),
    frogChords: plan && progress.status !== 'listening' ? answers.frogCells() : [],
    frogIndex: progress.chord,
    nextChords: answers.upcomingCells(),
    key: answers.keyCentre().key ? keyName(answers.keyCentre().key!) : null,
    keyChange: recentKeyChange(),
    beat: { barAt: answers.barClock().at, barMs: answers.barClock().ms },
    suggestions: suggestions.map((s) => s.name),
    borrowed: suggestions.some((s) => s.borrowed),
    weirdness: settings.weirdness,
    genre: settings.genre,
    phraseBars: settings.phraseBars,
    frogMode: settings.frogMode,
    rhythm: settings.rhythm,
    model: settings.model,
    bpm: settings.bpm,
    liveTempo,
    liveBar: liveBars > 0 ? liveBars : null,
    status,
    report,
    reportPending,
    reportBubble,
    reportMode: settings.reportMode,
    geminiAvailable,
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

// ---- transport info from Frog Voice: /tempo <bpm> and /bar at every bar start ----

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
window.jamFrog.osc.onError((text) => {
  status = `OSC: ${text}`;
  render();
});

window.addEventListener('beforeunload', () => {
  answers.cancel();
  sink.close();
});

render();
