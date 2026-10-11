import type { FrogMood } from '../../core/types';
import { GENRES } from '../../core/vocab';
import { createFrogPet } from './frog/controller';

export type Phase = 'idle' | 'listening' | 'playing';

export interface UiState {
  mood: FrogMood;
  phase: Phase;
  /** 1-based bar within the player's phrase or the frog's answer; 0 when idle */
  bar: number;
  bars: number;
  /** the chords of the player's phrase in progress (or the last one) */
  yourChords: string[];
  /** the frog's answer */
  frogChords: string[];
  /** which answer chord is sounding, -1 when none */
  frogIndex: number;
  /** jam mode: the frog's next block, shown under the current one so the player can get ready */
  nextChords: string[];
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
}

export type FrogMode = 'off' | 'answer' | 'jam';

export interface Handlers {
  onWeirdness(value: number): void;
  onGenre(genre: string): void;
  onPhraseBars(bars: 2 | 4 | 8): void;
  onFrogMode(mode: FrogMode): void;
  /** stop the frog (ends a jam) */
  onStop(): void;
  onRhythm(on: boolean): void;
  onModel(model: string): void;
  onBpm(bpm: number): void;
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

/** Pixels of vertical drag for the knob's full travel (0% to 100%). */
const KNOB_TRAVEL_PX = 160;

const MOOD_LABELS: Record<FrogMood, string> = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', weird: 'Weird' };

export function createOverlay(root: HTMLElement, handlers: Handlers) {
  const abort = new AbortController();
  const signal = abort.signal;
  const shell = document.createElement('div');
  shell.className = 'jf-shell';
  shell.innerHTML = `
    <header class="jf-header">
      <div class="jf-brand"><strong>JAM FROG</strong><span data-ref="mood">Ready</span></div>
      <button class="jf-icon" type="button" data-action="settings" aria-label="Settings" title="Settings">⚙</button>
      <button class="jf-icon" type="button" data-action="close" aria-label="Close Jam Frog">×</button>
    </header>
    <section class="jf-display" aria-live="polite">
      <div class="jf-display-top">
        <span class="jf-who" data-ref="who">YOUR CHORDS</span>
        <span class="jf-display-right">
          <button type="button" class="jf-stop" data-action="stop" hidden>■ Stop</button>
          <span class="jf-bars" data-ref="bars" aria-label="Bar"></span>
        </span>
      </div>
      <ol class="jf-chords" data-ref="chords"></ol>
      <div class="jf-next" data-ref="next" hidden><span>NEXT</span><ol class="jf-chords" data-ref="next-chords"></ol></div>
      <p class="jf-hint" data-ref="hint">Play some chords. The frog answers after your phrase (or jams on, in Jam mode).</p>
    </section>
    <section class="jf-scene">
      <div class="jf-bubble" data-ref="bubble" role="status"></div>
      <div class="jf-pet-stage" data-ref="pet-stage"></div>
    </section>
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
    <footer class="jf-footer"><b data-ref="live">WAITING FOR LIVE</b><span data-ref="status" class="jf-status" role="status"></span></footer>
    <div class="jf-settings" data-ref="settings" hidden>
      <div class="jf-settings-card" role="dialog" aria-label="Settings">
        <h2>Settings</h2>
        <label class="jf-field"><span>MODEL</span>
          <select data-control="model"><option value="gru">GRU (neural network)</option><option value="ngram">n-gram</option></select>
        </label>
        <label class="jf-field"><span>BPM WHEN LIVE IS STOPPED</span><input data-control="bpm" type="number" min="40" max="240" /></label>
        <p class="jf-note">Live's tempo and bars come from the Frog Voice device; this BPM is only used when Live isn't playing.</p>
        <button type="button" class="jf-done" data-action="settings-done">Done</button>
      </div>
    </div>`;
  root.replaceChildren(shell);

  const q = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const pet = createFrogPet(q('[data-ref="pet-stage"]'), { scale: 0.8, interactive: false, initialPosition: { x: 24, y: 9999 } });
  const knob = q<HTMLElement>('[data-control="weirdness"]');
  const genre = q<HTMLSelectElement>('[data-control="genre"]');
  const rhythm = q<HTMLInputElement>('[data-control="rhythm"]');
  const model = q<HTMLSelectElement>('[data-control="model"]');
  const bpm = q<HTMLInputElement>('[data-control="bpm"]');
  const settings = q<HTMLElement>('[data-ref="settings"]');
  const segments = [...shell.querySelectorAll<HTMLButtonElement>('[data-bars]')];
  const modes = [...shell.querySelectorAll<HTMLButtonElement>('[data-mode]')];
  const stop = q<HTMLButtonElement>('[data-action="stop"]');
  genre.add(new Option('All styles', 'all'));
  for (const g of GENRES) genre.add(new Option(g[0].toUpperCase() + g.slice(1), g));

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
  q('[data-action="close"]').addEventListener('click', () => window.close(), { signal });

  // update() runs on every note and bar, so never overwrite a control the player is using.
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  };
  const setChecked = (el: HTMLInputElement, on: boolean) => {
    if (document.activeElement !== el) el.checked = on;
  };

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

      // The display: your chords while you play, the frog's while it plays.
      const frogTurn = state.phase === 'playing' || (state.phase === 'idle' && state.frogChords.length > 0 && state.yourChords.length === 0);
      const chords = frogTurn ? state.frogChords : state.yourChords;
      q('[data-ref="who"]').textContent = frogTurn ? 'FROG PLAYS' : 'YOUR CHORDS';
      q('[data-ref="chords"]').replaceChildren(...chords.map((name, i) => {
        const li = document.createElement('li');
        li.textContent = name;
        if (frogTurn && i === state.frogIndex) li.className = 'is-now';
        if (!frogTurn && i === chords.length - 1 && state.phase === 'listening') li.className = 'is-now';
        return li;
      }));
      q('[data-ref="hint"]').hidden = chords.length > 0;
      const next = frogTurn && state.phase === 'playing' ? state.nextChords : [];
      q('[data-ref="next"]').hidden = next.length === 0;
      q('[data-ref="next-chords"]').replaceChildren(...next.map((name) => {
        const li = document.createElement('li');
        li.textContent = name;
        return li;
      }));
      q('[data-ref="bars"]').replaceChildren(...Array.from({ length: state.phase === 'idle' ? 0 : state.bars }, (_, i) => {
        const dot = document.createElement('i');
        if (i < state.bar) dot.className = 'is-done';
        return dot;
      }));

      // The frog's speech bubble suggests what to play next.
      const bubble = q('[data-ref="bubble"]');
      if (state.phase === 'playing') bubble.replaceChildren(state.frogMode === 'jam' ? 'Jamming! Play along, or press Stop.' : 'Listen… then your turn!');
      else if (state.suggestions.length) bubble.replaceChildren(...suggestionText(state.suggestions));
      else bubble.replaceChildren('Play me a chord!');

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
      for (const b of segments) b.setAttribute('aria-checked', String(Number(b.dataset.bars) === state.phraseBars));

      q('[data-ref="live"]').textContent = state.liveTempo === null
        ? 'WAITING FOR LIVE'
        : `LIVE ${state.liveTempo} BPM${state.liveBar ? ` · BAR ${state.liveBar}` : ''}`;
      q('[data-ref="status"]').textContent = state.status;
    },
    destroy(): void {
      abort.abort();
      pet.destroy();
      shell.remove();
    },
  };
}
