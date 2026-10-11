import { ListeningPlayer } from './listening-playback';
import { cached } from '../core/cached';
import type { ChordModel } from '../core/model';
import { GruModel, type GruWeights } from '../core/gru';
import { NgramModel, type NgramJson } from '../core/ngram';
import type { AnswerPlan, NoteSink } from '../core/types';
import { OscNoteSink } from './bridges/osc';
import gruText from '../../../model/export/gru_weights.json?raw';
import ngramText from '../../../model/export/ngram.json?raw';
import { getMidiAccess, WebMidiNoteSink } from './bridges/webmidi';
import {
  buildListeningPairs,
  buildPlaybackSequence,
  generateAnswer,
  stimulusSeed,
  summarizeVotes,
  type ListeningPair,
  type ModelId,
  type Vote,
} from './listening-session';

const $ = <T extends HTMLElement>(selector: string, _elementType?: { new (...args: never[]): T }): T =>
  document.querySelector<T>(selector)!;

const models: Record<ModelId, ChordModel> = {
  ngram: cached(new NgramModel(JSON.parse(ngramText) as NgramJson)),
  gru: cached(new GruModel(JSON.parse(gruText) as GruWeights)),
};

function sessionSeed(): number {
  if (globalThis.crypto?.getRandomValues) return globalThis.crypto.getRandomValues(new Uint32Array(1))[0];
  return Math.floor(Math.random() * 0xffffffff);
}

const pairs = buildListeningPairs(sessionSeed());
const answerCache = new Map<string, Promise<{ a: AnswerPlan; b: AnswerPlan }>>();
const votes = new Map<string, Vote>();
const heard = new Set<string>();

const outputSelect = $('#midi-output', HTMLSelectElement);
const bridgeSelect = $('#bridge', HTMLSelectElement);
const connectButton = $('#connect-midi', HTMLButtonElement);
const connectionStatus = $('#connection-status', HTMLElement);
const pairProgress = $('#pair-progress', HTMLElement);
const pairTitle = $('#pair-title', HTMLElement);
const progressionRow = $('#progression', HTMLElement);
const votePrompt = $('#vote-prompt', HTMLElement);
const playbackStatus = $('#playback-status', HTMLElement);
const revealButton = $('#reveal-results', HTMLButtonElement);
const testPanel = $('#test-panel', HTMLElement);
const resultsPanel = $('#results', HTMLElement);
const bpmSelect = $('#bpm', HTMLSelectElement);

let midiAccess: MIDIAccess | null = null;
let sink: NoteSink | null = null;
let currentIndex = 0;
let loadedPlans: { a: AnswerPlan; b: AnswerPlan } | null = null;
let loadToken = 0;
const player = new ListeningPlayer();
let selectedOutput: MIDIOutput | null = null;
let connectionToken = 0;
let playingClip: 'a' | 'b' | null = null;

function currentPair(): ListeningPair {
  return pairs[currentIndex];
}

function pairAnswers(pair: ListeningPair): Promise<{ a: AnswerPlan; b: AnswerPlan }> {
  let result = answerCache.get(pair.id);
  if (!result) {
    const seed = stimulusSeed(pair.id);
    result = Promise.all([
      generateAnswer(models[pair.aModel], pair.progression, pair.weirdness, seed),
      generateAnswer(models[pair.bModel], pair.progression, pair.weirdness, seed),
    ]).then(([a, b]) => ({ a, b }));
    answerCache.set(pair.id, result);
    result.catch(() => answerCache.delete(pair.id));
  }
  return result;
}

function chordNameList(plan: AnswerPlan): string {
  return plan.chords.map((chord) => chord.name).join(' → ');
}

function updateVoteUi(): void {
  const pair = currentPair();
  const canVote = heard.has(`${pair.id}:a`) && heard.has(`${pair.id}:b`);
  document.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((button) => {
    button.disabled = !canVote;
    button.setAttribute('aria-pressed', String(votes.get(pair.id) === button.dataset.vote));
  });
  votePrompt.textContent = canVote
    ? votes.has(pair.id) ? 'Vote saved. You can change it before revealing.' : 'Which answer would you keep in the jam?'
    : 'Listen to both answers to vote.';
  revealButton.disabled = votes.size !== pairs.length;
  $('#session-progress').textContent = `${heard.size}/20 clips heard · ${votes.size}/10 votes saved`;
  $('#previous-pair', HTMLButtonElement).disabled = currentIndex === 0;
  $('#next-pair', HTMLButtonElement).disabled = currentIndex === pairs.length - 1;
}

function renderProgression(pair: ListeningPair): void {
  progressionRow.replaceChildren();
  for (const chord of pair.progression.chords) {
    const chip = document.createElement('span');
    chip.className = 'chord-chip';
    chip.textContent = chord.name;
    progressionRow.append(chip);
  }
  progressionRow.setAttribute('aria-label', `${pair.progression.name} progression`);
}

function renderPair(): void {
  const pair = currentPair();
  pairProgress.textContent = `PAIR ${currentIndex + 1} OF ${pairs.length}`;
  pairTitle.textContent = pair.progression.name;
  renderProgression(pair);
  playbackStatus.textContent = '';
  loadedPlans = null;
  $('#retry-pair').hidden = true;
  for (const clip of ['a', 'b'] as const) {
    $(`[data-answer="${clip}"]`, HTMLElement).textContent = 'Preparing anonymous continuation…';
    $(`[data-state="${clip}"]`, HTMLElement).textContent = 'Preparing';
    $(`[data-play="${clip}"]`, HTMLButtonElement).disabled = true;
    $(`[data-clip="${clip}"]`, HTMLElement).classList.remove('is-playing');
  }
  updateVoteUi();
  const token = ++loadToken;
  pairAnswers(pair).then((answers) => {
    if (token !== loadToken) return;
    loadedPlans = answers;
    for (const clip of ['a', 'b'] as const) {
      $(`[data-answer="${clip}"]`, HTMLElement).textContent = chordNameList(answers[clip]);
      $(`[data-state="${clip}"]`, HTMLElement).textContent = heard.has(`${pair.id}:${clip}`) ? 'Heard' : 'Ready';
      $(`[data-play="${clip}"]`, HTMLButtonElement).disabled = !sink;
    }
    playbackStatus.textContent = sink ? 'Both continuations are ready to audition.' : 'Connect a MIDI output to enable playback.';
  }).catch((error: unknown) => {
    if (token !== loadToken) return;
    playbackStatus.textContent = `Could not generate this pair: ${String(error)}`;
    $('#retry-pair').hidden = false;
    for (const clip of ['a', 'b'] as const) $(`[data-state="${clip}"]`, HTMLElement).textContent = 'Error';
  });
}

function stopPlayback(message = 'Playback stopped.'): void {
  const error = player.stop();
  bpmSelect.disabled = false;
  if (playingClip) {
    $(`[data-clip="${playingClip}"]`, HTMLElement).classList.remove('is-playing');
    $(`[data-state="${playingClip}"]`, HTMLElement).textContent = heard.has(`${currentPair().id}:${playingClip}`) ? 'Heard' : 'Ready';
  }
  playingClip = null;
  playbackStatus.textContent = error ? `MIDI cleanup failed: ${String(error)}` : message;
  $('#stop-playback', HTMLButtonElement).disabled = true;
  document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => {
    button.disabled = !sink || !loadedPlans;
  });
}

function playAnswer(clip: 'a' | 'b'): void {
  if (!sink || !loadedPlans) return;
  stopPlayback('Starting playback…');
  const pair = currentPair();
  const plan = loadedPlans[clip];
  const sequence = buildPlaybackSequence(pair, plan);
  const bpm = Number(bpmSelect.value);
  bpmSelect.disabled = true;
  playingClip = clip;
  $('#stop-playback', HTMLButtonElement).disabled = false;
  $(`[data-clip="${clip}"]`, HTMLElement).classList.add('is-playing');
  $(`[data-state="${clip}"]`, HTMLElement).textContent = 'Playing';
  playbackStatus.textContent = `${clip.toUpperCase()} is playing — progression, then frog answer.`;
  document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => { button.disabled = true; });

  player.play(sink, sequence, bpm, {
    onChord: (chord) => {
      playbackStatus.textContent = `${clip.toUpperCase()} · ${chord.phase === 'context' ? 'Progression' : 'Frog answer'} · ${chord.name}`;
    },
    onComplete: () => {
      heard.add(`${pair.id}:${clip}`);
      stopPlayback(`${clip.toUpperCase()} complete. Replay either answer or cast your vote.`);
      updateVoteUi();
    },
    onError: (error) => {
      console.error('[listening_test] Playback failed', error);
      stopPlayback(`Playback failed: ${String(error)} Reconnect the output and replay.`);
    },
  });
}

async function chooseOutput(): Promise<void> {
  const output = midiAccess?.outputs.get(outputSelect.value) ?? null;
  if (output === selectedOutput && output?.state === 'connected') return;
  const token = ++connectionToken;
  stopPlayback('Changing MIDI output.');
  try { sink?.close(); } catch (error) { console.error('[listening_test] MIDI cleanup failed', error); }
  sink = null;
  selectedOutput = output;
  document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => { button.disabled = true; });
  connectionStatus.textContent = output ? 'Opening MIDI output…' : 'Choose the MIDI output routed to your Ableton instrument.';
  if (!output) return;
  try {
    await output.open();
    if (token !== connectionToken || output.state !== 'connected') return;
    sink = new WebMidiNoteSink(output);
    connectionStatus.textContent = `Connected to ${sink.name}.`;
    document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => { button.disabled = !loadedPlans; });
  } catch (error) {
    if (token !== connectionToken) return;
    selectedOutput = null;
    connectionStatus.textContent = `Could not open MIDI output: ${String(error)}`;
  }
}

function refreshOutputs(preferJamFrog = false): void {
  const selected = outputSelect.value;
  outputSelect.replaceChildren(new Option('Choose MIDI output…', ''));
  const outputs = midiAccess ? [...midiAccess.outputs.values()].filter((output) => output.state === 'connected') : [];
  for (const output of outputs) outputSelect.add(new Option(output.name ?? output.id, output.id));
  const preferred = preferJamFrog ? outputs.find((output) => (output.name ?? '').includes('JamFrog Out')) : undefined;
  outputSelect.value = outputs.some((output) => output.id === selected) ? selected : (preferred?.id ?? '');
  // Opening the selected port also emits statechange; it must not restart playback.
  if (bridgeSelect.value === 'ports') void chooseOutput();
  if (!outputs.length) connectionStatus.textContent = 'No MIDI output found. Enable the JamFrog Out IAC port, then refresh MIDI.';
}

async function connectMidi(): Promise<void> {
  connectButton.disabled = true;
  connectionStatus.textContent = 'Requesting MIDI access…';
  try {
    if (!navigator.requestMIDIAccess) throw new Error('Use a browser with Web MIDI support, such as Chrome, on localhost.');
    if (!midiAccess) midiAccess = await getMidiAccess();
    midiAccess.onstatechange = () => refreshOutputs();
    refreshOutputs(true);
    if (sink) connectionStatus.textContent = `Connected to ${sink.name}.`;
    connectButton.textContent = 'Refresh MIDI';
  } catch (error) {
    connectionStatus.textContent = `MIDI access unavailable: ${String(error)}`;
  } finally {
    connectButton.disabled = false;
  }
}

function changeBridge(): void {
  stopPlayback('Changing MIDI bridge.');
  try { sink?.close(); } catch (error) { console.error('[listening_test] MIDI cleanup failed', error); }
  sink = null;
  connectionToken++;
  const ports = bridgeSelect.value === 'ports';
  outputSelect.disabled = !ports;
  connectButton.disabled = !ports;
  try {
    if (ports) void chooseOutput();
    else {
      sink = new OscNoteSink();
      connectionStatus.textContent = `Connected to ${sink.name}.`;
      document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => { button.disabled = !loadedPlans; });
    }
  } catch (error) {
    connectionStatus.textContent = `OSC bridge unavailable: ${String(error)}`;
  }
}

function changePair(delta: number): void {
  stopPlayback('Pair changed.');
  currentIndex = Math.max(0, Math.min(pairs.length - 1, currentIndex + delta));
  renderPair();
}

function castVote(vote: Vote): void {
  const pair = currentPair();
  if (!heard.has(`${pair.id}:a`) || !heard.has(`${pair.id}:b`)) return;
  votes.set(pair.id, vote);
  updateVoteUi();
}

function showResults(): void {
  if (votes.size !== pairs.length) return;
  stopPlayback('Results revealed.');
  const totals = summarizeVotes(pairs, votes);
  const body = document.createElement('div');
  body.className = 'results-table';
  const heading = document.createElement('div');
  heading.className = 'result-row result-head';
  heading.innerHTML = '<span>PROGRESSION · WEIRDNESS</span><span>A</span><span>B</span><span>VOTE</span>';
  body.append(heading);
  for (const pair of pairs) {
    const vote = votes.get(pair.id)!;
    const aName = pair.aModel === 'ngram' ? 'n-gram' : 'GRU';
    const bName = pair.bModel === 'ngram' ? 'n-gram' : 'GRU';
    const row = document.createElement('div');
    row.className = 'result-row';
    const context = document.createElement('strong');
    context.textContent = `${pair.progression.name} · ${pair.weirdness.toFixed(1)}`;
    const a = document.createElement('span');
    a.textContent = aName;
    const b = document.createElement('span');
    b.textContent = bName;
    const result = document.createElement('span');
    result.textContent = vote === 'tie' ? 'Tie' : `${vote.toUpperCase()} preferred`;
    row.append(context, a, b, result);
    body.append(row);
  }
  $('#results-copy', HTMLElement).textContent = `Of ${pairs.length} blind comparisons, the totals below show how often each model’s answer was preferred at low and high weirdness. Ties: ${totals.ties}.`;
  const summary = document.createElement('div');
  summary.className = 'result-row result-head';
  summary.innerHTML = '<span>MODEL</span><span>LOW · 0.1</span><span>HIGH · 0.9</span><span>TOTAL WINS</span>';
  const resultRows = [summary];
  for (const [model, label] of [['ngram', 'n-gram'], ['gru', 'GRU']] as const) {
    const row = document.createElement('div');
    row.className = 'result-row';
    const name = document.createElement('strong');
    name.textContent = label;
    const low = document.createElement('span');
    low.textContent = String(totals[model].low);
    const high = document.createElement('span');
    high.textContent = String(totals[model].high);
    const wins = document.createElement('span');
    wins.textContent = String(totals[model].wins);
    row.append(name, low, high, wins);
    resultRows.push(row);
  }
  body.append(...resultRows);
  $('#results-table', HTMLElement).replaceChildren(body);
  testPanel.hidden = true;
  resultsPanel.hidden = false;
}

connectButton.addEventListener('click', () => void connectMidi());
outputSelect.addEventListener('change', () => void chooseOutput());
bridgeSelect.addEventListener('change', changeBridge);
$('#retry-pair').addEventListener('click', renderPair);
$('#previous-pair', HTMLButtonElement).addEventListener('click', () => changePair(-1));
$('#next-pair', HTMLButtonElement).addEventListener('click', () => changePair(1));
$('#stop-playback', HTMLButtonElement).addEventListener('click', () => stopPlayback());
document.querySelectorAll<HTMLButtonElement>('[data-play]').forEach((button) => {
  button.addEventListener('click', () => playAnswer(button.dataset.play as 'a' | 'b'));
});
document.querySelectorAll<HTMLButtonElement>('[data-vote]').forEach((button) => {
  button.addEventListener('click', () => castVote(button.dataset.vote as Vote));
});
revealButton.addEventListener('click', showResults);
$('#back-to-test', HTMLButtonElement).addEventListener('click', () => {
  resultsPanel.hidden = true;
  testPanel.hidden = false;
  renderPair();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopPlayback('Playback stopped while the page was hidden. Replay to finish the clip.');
});
window.addEventListener('pagehide', () => {
  stopPlayback('');
  connectionToken++;
  loadToken++;
  if (midiAccess) midiAccess.onstatechange = null;
  try { sink?.close(); } catch (error) { console.error('[listening_test] MIDI cleanup failed', error); }
  sink = null;
  selectedOutput = null;
});
window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return;
  if (midiAccess) midiAccess.onstatechange = () => refreshOutputs();
  refreshOutputs();
  renderPair();
});

bpmSelect.addEventListener('change', () => {
  stopPlayback();
  heard.clear();
  votes.clear();
  resultsPanel.hidden = true;
  testPanel.hidden = false;
  renderPair();
});
renderPair();
changeBridge();
