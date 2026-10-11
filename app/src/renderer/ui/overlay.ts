import type { Cell } from '../../core/answer';
import type { JamReport } from '../../core/report';
import type { FrogMood } from '../../core/types';
import { STYLE_NAMES } from '../../core/styles';
import { createFrogPet } from './frog/controller';
import { lookFor } from './frog/looks';

export type Phase = 'idle' | 'listening' | 'playing';

export interface UiState {
  mood: FrogMood;
  phase: Phase;
  /** 1-based bar within the player's phrase or the frog's answer; 0 when idle */
  bar: number;
  bars: number;
  /** the chords of the player's phrase in progress (or the last one), with their start beats */
  yourChords: Cell[];
  /** the frog's answer (or jam block), with start beats */
  frogChords: Cell[];
  /** which answer chord is sounding, -1 when none */
  frogIndex: number;
  /** jam mode: the frog's next block, shown under the current one so the player can get ready */
  nextChords: Cell[];
  /** the key centre ("C major"), null before the first chords */
  key: string | null;
  /** a key change that just happened (shown for a few seconds) */
  keyChange: { from: string; to: string } | null;
  /** the bar grid, so the frog dances in time: when the latest bar started (performance.now) and its length */
  beat: { barAt: number; barMs: number };
  /** the top suggestions, for the frog's speech bubble */
  suggestions: string[];
  /** a suggestion is borrowed from the parallel key (the frog looks weird) */
  borrowed: boolean;
  weirdness: number;
  genre: string;
  phraseBars: 2 | 4 | 8;
  /** off, answer each phrase once, or jam (keep playing until stopped) */
  frogMode: FrogMode;
  rhythm: boolean;
  model: string;
  bpm: number;
  liveTempo: number | null;
  liveBar: number | null;
  status: string;
  /** the last jam's report (kept until the next jam), and whether the frog is still writing it */
  report: JamReport | null;
  reportPending: boolean;
  /** the frog says the report's summary (until you play again) */
  reportBubble: boolean;
  reportMode: ReportMode;
  geminiAvailable: boolean;
}

export type FrogMode = 'off' | 'answer' | 'jam';
export type ReportMode = 'gemini' | 'local';

export interface Handlers {
  onWeirdness(value: number): void;
  onGenre(genre: string): void;
  onPhraseBars(bars: 2 | 4 | 8): void;
  onFrogMode(mode: FrogMode): void;
  /** stop the frog (ends a jam, and asks for its report) */
  onStop(): void;
  onRhythm(on: boolean): void;
  onModel(model: string): void;
  onBpm(bpm: number): void;
  onReportMode(mode: ReportMode): void;
}

/** "Try F", "Try F or Am", "Try F, Am or G", with the chord names in bold. */
export function suggestionText(names: string[]): (string | HTMLElement)[] {
  const parts: (string | HTMLElement)[] = ['Try '];
  names.forEach((name, i) => {
    if (i > 0) parts.push(i === names.length - 1 ? ' or ' : ', ');
    const b = document.createElement('b');
    b.textContent = name;
    parts.push(b);
  });
  return parts;
}

const BEATS_PER_BAR = 4;

/** One stretch of a bar on the display: a chord starting there, or the previous chord held over (name null). */
export interface Segment {
  /** index into the cells, -1 for a held-over chord */
  index: number;
  name: string | null;
  /** in beats */
  length: number;
}

/**
 * The chords laid out bar by bar: each bar holds the chords that start in it, each as long as it lasts
 * within the bar, and a held-over stretch where the bar starts with the previous chord still sounding.
 */
export function barSegments(cells: Cell[], bars: number): Segment[][] {
  const sorted = cells.map((c, index) => ({ ...c, index })).filter((c) => c.beat < bars * BEATS_PER_BAR).sort((a, b) => a.beat - b.beat);
  return Array.from({ length: bars }, (_, b) => {
    const from = b * BEATS_PER_BAR;
    const to = from + BEATS_PER_BAR;
    const inBar = sorted.filter((c) => c.beat >= from && c.beat < to);
    const segs: Segment[] = [];
    const first = inBar[0]?.beat ?? to;
    if (first > from) segs.push({ index: -1, name: null, length: first - from });
    inBar.forEach((c, i) => segs.push({ index: c.index, name: c.name, length: (inBar[i + 1]?.beat ?? to) - c.beat }));
    return segs;
  });
}

/** Pixels of vertical drag for the knob's full travel (0% to 100%). */
const KNOB_TRAVEL_PX = 160;

const MOOD_LABELS: Record<FrogMood, string> = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', weird: 'Weird' };

export function createOverlay(root: HTMLElement, handlers: Handlers) {
  const abort = new AbortController();
  const signal = abort.signal;
  const shell = document.createElement('div');
  shell.className = 'jf-shell';
  shell.innerHTML = `
    <section class="jf-scene">
      <div class="jf-bubble" data-ref="bubble" role="status"></div>
      <svg class="jf-bubble-tail" data-ref="bubble-tail" aria-hidden="true"><path></path></svg>
      <div class="jf-pet-stage" data-ref="pet-stage"></div>
    </section>
    <div class="jf-rig">
      <div class="jf-head">
        <header class="jf-header">
          <div class="jf-brand"><strong>JAM FROG</strong><span data-ref="mood">Ready</span></div>
          <button class="jf-icon" type="button" data-action="report" aria-label="Last jam report" title="Last jam report" hidden>📋</button>
          <button class="jf-icon" type="button" data-action="settings" aria-label="Settings" title="Settings">⚙</button>
          <button class="jf-icon" type="button" data-action="close" aria-label="Close Jam Frog">×</button>
        </header>
        <section class="jf-amp" aria-label="Controls">
          <div class="jf-knob-control"><span>WEIRDNESS</span>
            <span class="jf-knob" data-control="weirdness" role="slider" tabindex="0" aria-label="Weirdness"
              aria-valuemin="0" aria-valuemax="100" title="Drag up or down"><span class="jf-knob-visual" data-ref="knob"></span></span>
            <output data-ref="weirdness-value"></output>
          </div>
          <div class="jf-amp-right">
            <label class="jf-field"><span>GENRE</span><select data-control="genre"></select></label>
            <div class="jf-field"><span>PHRASE</span>
              <div class="jf-segments" role="radiogroup" aria-label="Phrase length in bars">
                <button type="button" data-bars="2" role="radio">2</button>
                <button type="button" data-bars="4" role="radio">4</button>
                <button type="button" data-bars="8" role="radio">8</button>
              </div>
            </div>
            <div class="jf-field"><span>FROG</span>
              <div class="jf-segments" role="radiogroup" aria-label="What the frog does">
                <button type="button" data-mode="off" role="radio" title="The frog only suggests">Off</button>
                <button type="button" data-mode="answer" role="radio" title="The frog answers each phrase">Answer</button>
                <button type="button" data-mode="jam" role="radio" title="After your phrase the frog keeps playing until you stop it">Jam</button>
              </div>
            </div>
            <label class="jf-check" title="The frog answers in the rhythm and dynamics you played"><input data-control="rhythm" type="checkbox" /><span>Copy my rhythm</span></label>
          </div>
        </section>
      </div>
      <div class="jf-cab">
        <section class="jf-display" aria-live="polite">
          <div class="jf-display-top">
            <span class="jf-who" data-ref="who">YOUR CHORDS</span>
            <span class="jf-key" data-ref="key" hidden></span>
            <span class="jf-display-right">
              <button type="button" class="jf-stop" data-action="stop" hidden>■ Stop</button>
              <span class="jf-bars" data-ref="bars" aria-label="Bar"></span>
            </span>
          </div>
          <div class="jf-grid" data-ref="chords"></div>
          <div class="jf-next" data-ref="next" hidden><span>NEXT</span><div class="jf-grid" data-ref="next-chords"></div></div>
          <p class="jf-hint" data-ref="hint">Play some chords. The frog answers after your phrase (or jams on, in Jam mode).</p>
          <footer class="jf-footer"><b data-ref="live">WAITING FOR LIVE</b><span data-ref="status" class="jf-status" role="status"></span></footer>
        </section>
      </div>
      <div class="jf-feet" aria-hidden="true"><i></i><i></i></div>
    </div>
    <div class="jf-settings" data-ref="settings" hidden>
      <div class="jf-settings-card" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <label class="jf-field"><span>MODEL</span>
          <select data-control="model"><option value="gru">GRU (neural network)</option><option value="ngram">n-gram</option></select>
        </label>
        <label class="jf-field"><span>BPM WHEN LIVE IS STOPPED</span><input data-control="bpm" type="number" min="40" max="240" /></label>
        <label class="jf-field"><span>JAM REPORT</span>
          <select data-control="report-mode"><option value="gemini">Gemini</option><option value="local">On this Mac only</option></select>
        </label>
        <p class="jf-note" data-ref="report-note"></p>
        <p class="jf-note">Live's tempo and bars come from the Frog Voice device; this BPM is only used when Live isn't playing.</p>
        <button type="button" class="jf-done" data-action="settings-done">Done</button>
      </div>
    </div>
    <div class="jf-report" data-ref="report-panel" hidden>
      <div class="jf-report-card" role="dialog" aria-label="Jam report">
        <h2>Jam report</h2>
        <p class="jf-report-meta" data-ref="report-meta"></p>
        <p class="jf-report-summary" data-ref="report-summary"></p>
        <ol class="jf-moments" data-ref="report-moments"></ol>
        <div class="jf-trivia" data-ref="report-trivia"></div>
        <p class="jf-note" data-ref="report-source"></p>
        <button type="button" class="jf-done" data-action="report-done">Close</button>
      </div>
    </div>`;
  root.replaceChildren(shell);

  const q = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const pet = createFrogPet(q('[data-ref="pet-stage"]'), { scale: 0.8, interactive: false, initialPosition: { x: 24, y: 9999 } });
  const scene = q<HTMLElement>('.jf-scene');
  const bubble = q<HTMLElement>('[data-ref="bubble"]');
  const tail = shell.querySelector<SVGSVGElement>('[data-ref="bubble-tail"]')!;
  const tailPath = tail.querySelector('path')!;
  let mouth = { x: 105, y: 95 };
  const placeBubble = () => {
    const height = bubble.offsetHeight;
    const top = Math.max(8, Math.min(scene.clientHeight - height - 8, mouth.y - height / 2));
    bubble.style.top = `${top}px`;
    const joinY = Math.max(top + 14, Math.min(top + height - 14, mouth.y));
    const edgeX = bubble.offsetLeft + 2;
    tail.setAttribute('viewBox', `0 0 ${scene.clientWidth} ${scene.clientHeight}`);
    tailPath.setAttribute('d', `M ${mouth.x} ${mouth.y} L ${edgeX} ${joinY - 9} L ${edgeX} ${joinY + 9} Z`);
  };
  pet.subscribe((snapshot) => {
    if (Math.abs(snapshot.mouth.x - mouth.x) < .5 && Math.abs(snapshot.mouth.y - mouth.y) < .5) return;
    mouth = snapshot.mouth;
    placeBubble();
  });
  const bubbleSize = new ResizeObserver(placeBubble);
  bubbleSize.observe(bubble);
  bubbleSize.observe(scene);
  const knob = q<HTMLElement>('[data-control="weirdness"]');
  const genre = q<HTMLSelectElement>('[data-control="genre"]');
  const rhythm = q<HTMLInputElement>('[data-control="rhythm"]');
  const model = q<HTMLSelectElement>('[data-control="model"]');
  const bpm = q<HTMLInputElement>('[data-control="bpm"]');
  const reportMode = q<HTMLSelectElement>('[data-control="report-mode"]');
  const settings = q<HTMLElement>('[data-ref="settings"]');
  const reportPanel = q<HTMLElement>('[data-ref="report-panel"]');
  const segments = [...shell.querySelectorAll<HTMLButtonElement>('[data-bars]')];
  const modes = [...shell.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const stop = q<HTMLButtonElement>('[data-action="stop"]');
  genre.add(new Option('All styles', 'all'));
  for (const g of STYLE_NAMES) genre.add(new Option(g[0].toUpperCase() + g.slice(1), g));

  // The knob turns like a hardware knob: press anywhere on it and drag up (clockwise, more) or down (less),
  // relative to where you pressed, so it never jumps. Arrow keys work too.
  let weirdValue = 0;
  const setWeird = (v: number) => {
    weirdValue = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
    drawKnob(weirdValue);
    handlers.onWeirdness(weirdValue);
  };
  let drag: { id: number; y: number; from: number } | null = null;
  knob.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    knob.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, y: e.clientY, from: weirdValue };
  }, { signal });
  knob.addEventListener('pointermove', (e) => {
    if (drag && e.pointerId === drag.id) setWeird(drag.from + (drag.y - e.clientY) / KNOB_TRAVEL_PX);
  }, { signal });
  const endDrag = (e: PointerEvent) => {
    if (drag && e.pointerId === drag.id) drag = null;
  };
  knob.addEventListener('pointerup', endDrag, { signal });
  knob.addEventListener('pointercancel', endDrag, { signal });
  knob.addEventListener('keydown', (e) => {
    const step = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05 }[e.key];
    if (step === undefined) return;
    e.preventDefault();
    setWeird(weirdValue + step);
  }, { signal });
  function drawKnob(w: number): void {
    q('[data-ref="weirdness-value"]').textContent = `${Math.round(w * 100)}%`;
    q('[data-ref="knob"]').style.setProperty('--knob-angle', `${-135 + w * 270}deg`);
    knob.setAttribute('aria-valuenow', String(Math.round(w * 100)));
  }
  genre.addEventListener('change', () => handlers.onGenre(genre.value), { signal });
  rhythm.addEventListener('change', () => handlers.onRhythm(rhythm.checked), { signal });
  model.addEventListener('change', () => handlers.onModel(model.value), { signal });
  reportMode.addEventListener('change', () => handlers.onReportMode(reportMode.value as ReportMode), { signal });
  bpm.addEventListener('change', () => {
    const value = Math.max(40, Math.min(240, Math.round(Number(bpm.value) || 120)));
    bpm.value = String(value);
    handlers.onBpm(value);
  }, { signal });
  for (const b of segments) {
    b.addEventListener('click', () => handlers.onPhraseBars(Number(b.dataset.bars) as 2 | 4 | 8), { signal });
  }
  for (const b of modes) b.addEventListener('click', () => handlers.onFrogMode(b.dataset.mode as FrogMode), { signal });
  stop.addEventListener('click', () => handlers.onStop(), { signal });
  q('[data-action="settings"]').addEventListener('click', () => (settings.hidden = !settings.hidden), { signal });
  q('[data-action="settings-done"]').addEventListener('click', () => (settings.hidden = true), { signal });
  q('[data-action="report"]').addEventListener('click', () => (reportPanel.hidden = !reportPanel.hidden), { signal });
  q('[data-action="report-done"]').addEventListener('click', () => (reportPanel.hidden = true), { signal });
  q('[data-action="close"]').addEventListener('click', () => window.close(), { signal });

  // update() runs on every note and bar, so never overwrite a control the player is using.
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  };
  const setChecked = (el: HTMLInputElement, on: boolean) => {
    if (document.activeElement !== el) el.checked = on;
  };

  let lastSaid = '';

  /** The chords bar by bar: one box per bar, each chord as wide as it lasts in the bar. */
  function drawBars(grid: HTMLElement, cells: Cell[], bars: number, nowIndex: number, nowBar: number): void {
    grid.style.setProperty('--cols', String(Math.min(bars, 4)));
    grid.replaceChildren(...barSegments(cells, bars).map((segs, b) => {
      const bar = document.createElement('div');
      bar.className = 'jf-bar';
      if (b === nowBar) bar.classList.add('is-current');
      if (segs.filter((s) => s.name).length > 1) bar.classList.add('is-split');
      for (const seg of segs) {
        const span = document.createElement('span');
        span.className = seg.name ? 'jf-seg' : 'jf-seg is-hold';
        span.style.flexGrow = String(seg.length);
        span.textContent = seg.name ?? '';
        if (seg.index >= 0 && seg.index === nowIndex) span.classList.add('is-now');
        bar.append(span);
      }
      return bar;
    }));
  }

  function drawReport(r: JamReport, pending: boolean): void {
    q('[data-ref="report-meta"]').textContent = r.meta;
    q('[data-ref="report-summary"]').textContent = r.summary;
    q('[data-ref="report-moments"]').replaceChildren(...r.moments.map((m) => {
      const li = document.createElement('li');
      const bar = document.createElement('span');
      bar.className = 'jf-moment-bar';
      bar.textContent = `Bar ${m.bar}`;
      const title = document.createElement('b');
      title.textContent = m.title;
      const text = document.createElement('p');
      text.textContent = m.text;
      li.append(bar, title, text);
      return li;
    }));
    const trivia = q('[data-ref="report-trivia"]');
    trivia.hidden = r.trivia.length === 0;
    trivia.replaceChildren(...(r.trivia.length ? [Object.assign(document.createElement('h3'), { textContent: 'Did you know?' })] : []),
      ...r.trivia.map((t) => Object.assign(document.createElement('p'), { textContent: t })));
    q('[data-ref="report-source"]').textContent = pending
      ? 'Asking Gemini for a livelier write-up…'
      : r.source === 'gemini' ? 'Written by Gemini from your jam’s chord names.' : 'Written on this Mac from your jam’s chords.';
  }

  return {
    pet,
    update(state: UiState): void {
      const weird = state.weirdness > 0.7 || state.borrowed;
      const mood: FrogMood = weird && state.phase !== 'playing' ? 'weird' : state.mood;
      shell.dataset.mood = mood;
      shell.dataset.phase = state.phase;
      q('[data-ref="mood"]').textContent = state.phase === 'playing' ? 'Playing' : MOOD_LABELS[mood];
      pet.setMood(mood);
      pet.setMusicPlaying(state.phase === 'playing');
      pet.setLook(lookFor(state.genre));
      pet.setTempo(state.beat.barMs > 0 ? { anchor: state.beat.barAt, beatMs: state.beat.barMs / BEATS_PER_BAR } : null);

      // The display: your chords while you play, the frog's while it plays, bar by bar.
      const frogTurn = state.phase === 'playing' || (state.phase === 'idle' && state.frogChords.length > 0 && state.yourChords.length === 0);
      const chords = frogTurn ? state.frogChords : state.yourChords;
      q('[data-ref="who"]').textContent = frogTurn ? 'FROG PLAYS' : 'YOUR CHORDS';
      const nowBar = state.phase === 'idle' ? -1 : state.bar - 1;
      const nowIndex = frogTurn ? state.frogIndex : state.phase === 'listening' ? chords.length - 1 : -1;
      drawBars(q('[data-ref="chords"]'), chords, chords.length ? state.bars : 0, nowIndex, nowBar);
      q('[data-ref="hint"]').hidden = chords.length > 0;
      const next = frogTurn && state.phase === 'playing' ? state.nextChords : [];
      q('[data-ref="next"]').hidden = next.length === 0;
      drawBars(q('[data-ref="next-chords"]'), next, next.length ? state.bars : 0, -1, -1);
      q('[data-ref="bars"]').replaceChildren(...Array.from({ length: state.phase === 'idle' ? 0 : state.bars }, (_, i) => {
        const dot = document.createElement('i');
        if (i < state.bar) dot.className = 'is-done';
        return dot;
      }));

      // The key centre, lit up for a moment when it changes.
      const key = q('[data-ref="key"]');
      key.hidden = !state.key;
      key.textContent = state.keyChange ? `${state.keyChange.from} → ${state.keyChange.to}` : `KEY ${state.key ?? ''}`;
      key.classList.toggle('is-changed', !!state.keyChange);

      // The frog's speech bubble: the jam report, a key change, or what to play next.
      const reportTalk = state.reportBubble && state.report && state.phase === 'idle';
      // redraw only when it changes (update() runs often, and a rebuilt button would lose its click)
      const said = JSON.stringify([reportTalk && state.report!.summary, reportTalk && state.reportPending, state.keyChange, state.phase, state.frogMode, state.suggestions]);
      if (said !== lastSaid) {
      lastSaid = said;
      bubble.classList.toggle('is-report', !!reportTalk);
      if (reportTalk) {
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'jf-more';
        more.textContent = 'Full report ›';
        more.addEventListener('click', () => (reportPanel.hidden = false));
        const words = Object.assign(document.createElement('span'), { textContent: state.reportPending ? 'Ribbit! Let me write up our jam…' : state.report!.summary });
        bubble.replaceChildren(...(state.reportPending ? [words] : [words, more]));
      } else if (state.keyChange) bubble.replaceChildren('Key change! Now in ', Object.assign(document.createElement('b'), { textContent: state.keyChange.to }), '.');
      else if (state.phase === 'playing') bubble.replaceChildren(state.frogMode === 'jam' ? 'Jamming! Play along, or press Stop.' : 'Listen… then your turn!');
      else if (state.suggestions.length) bubble.replaceChildren(...suggestionText(state.suggestions));
      else bubble.replaceChildren('Play me a chord!');
      placeBubble();
      }

      q('[data-action="report"]').hidden = !state.report;
      if (state.report) drawReport(state.report, state.reportPending);
      else reportPanel.hidden = true;

      if (!drag) {
        weirdValue = Math.max(0, Math.min(1, state.weirdness));
        drawKnob(weirdValue);
      }
      setValue(genre, state.genre || 'all');
      for (const b of modes) b.setAttribute('aria-checked', String(b.dataset.mode === state.frogMode));
      stop.hidden = !(state.frogMode === 'jam' && state.phase === 'playing');
      setChecked(rhythm, state.rhythm);
      setValue(model, state.model);
      setValue(bpm, String(state.bpm));
      const geminiOption = reportMode.options[0];
      geminiOption.disabled = !state.geminiAvailable;
      geminiOption.textContent = state.geminiAvailable ? 'Gemini' : 'Gemini (no API key)';
      setValue(reportMode, state.geminiAvailable ? state.reportMode : 'local');
      q('[data-ref="report-note"]').textContent = state.geminiAvailable && state.reportMode === 'gemini'
        ? 'After a jam, its chord names, bars and key (nothing else) go to Google’s Gemini to write the report.'
        : 'The jam report is written on this Mac; nothing leaves it.';
      for (const b of segments) b.setAttribute('aria-checked', String(Number(b.dataset.bars) === state.phraseBars));

      q('[data-ref="live"]').textContent = state.liveTempo === null
        ? 'WAITING FOR LIVE'
        : `LIVE ${state.liveTempo} BPM${state.liveBar ? ` · BAR ${state.liveBar}` : ''}`;
      q('[data-ref="status"]').textContent = state.status;
    },
    destroy(): void {
      abort.abort();
      bubbleSize.disconnect();
      pet.destroy();
      shell.remove();
    },
  };
}
