import type { AnswerPlan, FrogMood, Suggestion } from '../../core/types';
import { GENRES } from '../../core/vocab';
import { createFrogPet } from './frog/controller';

export interface UiState {
  mood: FrogMood;
  current: string | null;
  trail: string[];
  suggestions: Suggestion[];
  answer: AnswerPlan | null;
  progress: { status: 'idle' | 'listening' | 'playing'; bar: number; bars: number };
  weirdness: number;
  genre: string;
  phraseBars: 4 | 8;
  answersOn: boolean;
  bridge: 'osc' | 'ports';
  bpm: number;
  liveTempo: number | null;
  bar: number | null;
  status: string;
  /** True while Frog Voice is actively playing an answer phrase. */
  musicPlaying?: boolean;
  /** which chord model is in use ('ngram' | 'gru') */
  model?: string;
  /** the frog copies the rhythm and dynamics of the player's phrase */
  rhythm?: boolean;
}

export interface Handlers {
  onWeirdness(value: number): void;
  onGenre(genre: string): void;
  onAnswersToggle(on: boolean): void;
  onPhraseBars(bars: 4 | 8): void;
  onBridge(bridge: 'osc' | 'ports'): void;
  onBpm(bpm: number): void;
  onModel?(model: string): void;
  onRhythm?(on: boolean): void;
}

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const BLACK_PITCHES = new Set([1, 3, 6, 8, 10]);
const WHITE_PITCHES = [0, 2, 4, 5, 7, 9, 11];
const MOOD_LABELS: Record<FrogMood, string> = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', weird: 'Weird' };

function pitchName(midi: number): string {
  return `${PITCH_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 2}`;
}

/**
 * The keys to draw for a voicing: two octaves from the C at or below its lowest note (C3..C5 when empty),
 * extended to the next C if the voicing reaches higher. Suggestions are voiced in the player's register,
 * so this can be anywhere on the keyboard.
 */
export function keyboardRange(voicing: number[]): [number, number] {
  if (voicing.length === 0) return [60, 84];
  const lo = 12 * Math.floor(Math.min(...voicing) / 12);
  const top = Math.max(...voicing);
  return [lo, Math.max(lo + 24, 12 * Math.ceil(top / 12))];
}

function makeKeyboard(voicing: number[]): HTMLElement {
  const keyboard = document.createElement('div');
  keyboard.className = 'jf-keyboard';
  keyboard.setAttribute('aria-label', `Voicing ${voicing.map(pitchName).join(', ') || 'not available'}`);
  keyboard.setAttribute('role', 'img');
  const active = new Set(voicing);
  const [lo, hi] = keyboardRange(voicing);
  const isWhite = (midi: number) => WHITE_PITCHES.includes(((midi % 12) + 12) % 12);
  let whites = 0;
  for (let midi = lo; midi <= hi; midi++) if (isWhite(midi)) whites++;
  let whitesBefore = 0;
  for (let midi = lo; midi <= hi; midi++) {
    const key = document.createElement('span');
    const black = BLACK_PITCHES.has(((midi % 12) + 12) % 12);
    key.className = `jf-key${black ? ' is-black' : ''}${active.has(midi) ? ' is-active' : ''}`;
    key.title = `${pitchName(midi)}${active.has(midi) ? ' in voicing' : ''}`;
    if (black) {
      key.style.left = `${(whitesBefore / whites) * 100 - (0.58 / whites) * 50}%`;
      key.style.width = `${(0.58 / whites) * 100}%`;
    } else {
      key.style.width = `${100 / whites}%`;
      whitesBefore++;
    }
    keyboard.append(key);
  }
  return keyboard;
}

function makeSuggestionCard(suggestion: Suggestion, index: number): HTMLLIElement {
  const item = document.createElement('li');
  item.className = `jf-suggestion${suggestion.borrowed ? ' is-borrowed' : ''}`;
  const rank = document.createElement('span');
  rank.className = 'jf-rank';
  rank.textContent = String(index + 1).padStart(2, '0');
  const name = document.createElement('strong');
  name.className = 'jf-suggestion-name';
  name.textContent = suggestion.name;
  const probability = document.createElement('span');
  probability.className = 'jf-probability';
  probability.textContent = `${Math.round(suggestion.prob * 100)}%`;
  const note = document.createElement('span');
  note.className = 'jf-borrowed';
  note.textContent = suggestion.borrowed ? 'borrowed' : '';
  if (suggestion.borrowed) note.setAttribute('aria-label', 'Borrowed chord');
  const details = document.createElement('div');
  details.className = 'jf-suggestion-details';
  details.append(name, probability, note);
  item.append(rank, details, makeKeyboard(suggestion.voicing));
  return item;
}

export function createOverlay(root: HTMLElement, handlers: Handlers) {
  const abort = new AbortController();
  const signal = abort.signal;
  const shell = document.createElement('div');
  shell.className = 'jf-shell';
  shell.innerHTML = `
    <header class="jf-header">
      <div class="jf-brand"><strong>JAM FROG</strong><span>your jam partner</span></div>
      <span class="jf-mood" data-ref="mood">Ready</span>
      <button class="jf-close" type="button" aria-label="Close Jam Frog" data-action="close">×</button>
    </header>
    <main class="jf-main">
      <section class="jf-scene" aria-label="Jam Frog sitting on an amplifier">
        <div class="jf-amp" aria-label="Jam Frog amplifier">
          <div class="jf-amp-top" aria-hidden="true"></div>
          <div class="jf-amp-face">
            <div class="jf-amp-output" data-ref="amp-output" aria-label="Frog output" aria-live="polite">
              <div class="jf-output-heading"><span>FROG OUTPUT</span><strong data-ref="amp-output-mode">FROG ANSWER</strong></div>
              <ol class="jf-output-list" data-ref="amp-output-list"></ol>
            </div>
            <label class="jf-amp-control" for="jf-weirdness"><span>WEIRDNESS</span>
              <span class="jf-knob-wrap"><span class="jf-knob-visual" data-ref="knob" aria-hidden="true"></span>
                <input id="jf-weirdness" data-control="weirdness" type="range" min="0" max="1" step="0.01" value="0.24" aria-label="Weirdness" />
              </span><output data-ref="weirdness-value" for="jf-weirdness">24%</output>
            </label>
            <label class="jf-amp-control jf-genre-control" for="jf-genre"><span>GENRE</span><select id="jf-genre" data-control="genre"></select></label>
          </div>
        </div>
        <div class="jf-pet-stage" data-ref="pet-stage" aria-label="Jam Frog animated companion"></div>
      </section>
      <section class="jf-current" aria-label="Current music">
        <div class="jf-current-main"><span class="jf-kicker">YOU PLAYED</span><strong class="jf-current-chord" data-ref="current" aria-live="polite">—</strong>
          <span class="jf-current-progress" data-ref="progress"></span></div>
      </section>
      <section class="jf-suggestions" aria-labelledby="jf-suggestions-title">
        <div class="jf-section-heading"><h2 id="jf-suggestions-title">Try next</h2><span>TOP PICKS</span></div>
        <ol class="jf-suggestion-list" data-ref="suggestions" aria-label="Suggested next chords" aria-live="polite"></ol>
      </section>
      <section class="jf-trail" aria-label="Recent chords"><span class="jf-kicker">TRAIL</span><ol data-ref="trail"></ol></section>
      <section class="jf-controls" aria-label="Jam settings">
        <label class="jf-toggle"><input data-control="answers" type="checkbox" checked /><span>Answers on</span></label>
        <label class="jf-toggle" title="The frog answers in the rhythm and dynamics you played"><input data-control="rhythm" type="checkbox" /><span>Copy my rhythm</span></label>
        <label class="jf-bridge">Bridge<select data-control="bridge"><option value="osc">Max for Live</option><option value="ports">Ports / IAC</option></select></label>
        <label class="jf-bpm">BPM<input data-control="bpm" type="number" min="40" max="240" value="120" inputmode="numeric" /></label>
        <label class="jf-phrase">Phrase<select data-control="phrase"><option value="4">4 bars</option><option value="8">8 bars</option></select></label>
        <label class="jf-model">Model<select data-control="model"><option value="ngram">n-gram</option><option value="gru">GRU</option></select></label>
      </section>
    </main>
    <footer class="jf-footer"><span class="jf-live"><b data-ref="live-tempo">WAITING FOR LIVE</b></span>
      <span class="jf-footer-tempo" data-ref="tempo">— BPM</span><span class="jf-live">BAR <b data-ref="bar">—</b></span>
      <span class="jf-status" data-ref="status" role="status" aria-live="polite"></span></footer>`;
  root.replaceChildren(shell);

  const query = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
  const stage = query<HTMLElement>('[data-ref="pet-stage"]');
  const pet = createFrogPet(stage, { scale: 0.48 });
  const current = query<HTMLElement>('[data-ref="current"]');
  const moodLabel = query<HTMLElement>('[data-ref="mood"]');
  const suggestions = query<HTMLOListElement>('[data-ref="suggestions"]');
  const ampOutput = query<HTMLElement>('[data-ref="amp-output"]');
  const ampOutputMode = query<HTMLElement>('[data-ref="amp-output-mode"]');
  const ampOutputList = query<HTMLOListElement>('[data-ref="amp-output-list"]');
  const trail = query<HTMLOListElement>('[data-ref="trail"]');
  const weirdness = query<HTMLInputElement>('[data-control="weirdness"]');
  const weirdnessValue = query<HTMLOutputElement>('[data-ref="weirdness-value"]');
  const knob = query<HTMLElement>('[data-ref="knob"]');
  const genre = query<HTMLSelectElement>('[data-control="genre"]');
  const answers = query<HTMLInputElement>('[data-control="answers"]');
  const bridge = query<HTMLSelectElement>('[data-control="bridge"]');
  const bpm = query<HTMLInputElement>('[data-control="bpm"]');
  const phrase = query<HTMLSelectElement>('[data-control="phrase"]');
  const model = query<HTMLSelectElement>('[data-control="model"]');
  const rhythm = query<HTMLInputElement>('[data-control="rhythm"]');
  genre.add(new Option('All styles', 'all'));
  for (const item of GENRES) genre.add(new Option(item, item));

  weirdness.addEventListener('input', () => handlers.onWeirdness(Number(weirdness.value)), { signal });
  genre.addEventListener('change', () => handlers.onGenre(genre.value), { signal });
  answers.addEventListener('change', () => handlers.onAnswersToggle(answers.checked), { signal });
  query<HTMLButtonElement>('[data-action="close"]').addEventListener('click', () => window.close(), { signal });
  bridge.addEventListener('change', () => handlers.onBridge(bridge.value as UiState['bridge']), { signal });
  bpm.addEventListener('change', () => {
    const value = Math.max(40, Math.min(240, Math.round(Number(bpm.value) || 120)));
    bpm.value = String(value);
    handlers.onBpm(value);
  }, { signal });
  phrase.addEventListener('change', () => handlers.onPhraseBars(Number(phrase.value) === 8 ? 8 : 4), { signal });
  model.addEventListener('change', () => handlers.onModel?.(model.value), { signal });
  rhythm.addEventListener('change', () => handlers.onRhythm?.(rhythm.checked), { signal });

  // Bug fix: update() runs on every note and bar in the app, so never overwrite a control the player is
  // using (typing a BPM, dragging the knob, an open dropdown).
  const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
    if (document.activeElement !== el && el.value !== value) el.value = value;
  };

  return {
    pet,
    update(state: UiState): void {
      const weird = state.weirdness > 0.7 || state.suggestions.some((item) => item.borrowed);
      const mood = weird ? 'weird' : state.mood;
      shell.dataset.mood = mood;
      moodLabel.textContent = MOOD_LABELS[mood];
      pet.setMood(mood);
      pet.setMusicPlaying(Boolean(state.musicPlaying));
      current.textContent = state.current ?? '—';
      const playerIsPlaying = state.progress.status === 'listening';
      ampOutputMode.textContent = playerIsPlaying ? 'NEXT CHORDS' : 'FROG ANSWER';
      ampOutput.setAttribute('aria-label', playerIsPlaying ? 'Suggested next chords' : 'Frog answer');
      ampOutput.classList.toggle('is-suggesting', playerIsPlaying);
      const outputItems = playerIsPlaying
        ? state.suggestions.slice(0, 3).map((item) => item.name)
        : state.answersOn && state.answer
          ? [state.answer.chords.map((item) => item.name).join(' → ')] // up to 4 chords: one line fits the amp
          : [state.answersOn ? 'Waiting for a phrase' : 'Answers are off'];
      ampOutputList.replaceChildren(...outputItems.map((name) => {
        const item = document.createElement('li');
        item.textContent = name;
        return item;
      }));
      query<HTMLElement>('[data-ref="progress"]').textContent = state.progress.status === 'idle'
        ? '' : `${state.progress.status} ${state.progress.bar}/${state.progress.bars}`;
      suggestions.replaceChildren(...state.suggestions.slice(0, 3).map(makeSuggestionCard));
      const trailEntries = state.trail.slice(-6);
      trail.replaceChildren(...trailEntries.map((chord) => {
        const item = document.createElement('li');
        item.textContent = chord;
        return item;
      }));
      const normalizedWeirdness = Math.max(0, Math.min(1, state.weirdness));
      setValue(weirdness, String(normalizedWeirdness));
      weirdnessValue.value = `${Math.round(normalizedWeirdness * 100)}%`;
      knob.style.setProperty('--knob-angle', `${-135 + normalizedWeirdness * 270}deg`);
      setValue(genre, state.genre || 'all');
      if (document.activeElement !== answers) answers.checked = state.answersOn;
      setValue(bridge, state.bridge);
      setValue(bpm, String(state.bpm));
      setValue(phrase, String(state.phraseBars));
      if (state.model) setValue(model, state.model);
      if (document.activeElement !== rhythm) rhythm.checked = Boolean(state.rhythm);
      query<HTMLElement>('[data-ref="tempo"]').textContent = state.liveTempo === null ? '— BPM' : `${state.liveTempo} BPM`;
      query<HTMLElement>('[data-ref="bar"]').textContent = state.bar === null ? '—' : String(state.bar);
      query<HTMLElement>('[data-ref="live-tempo"]').textContent = state.liveTempo === null ? 'WAITING FOR LIVE' : 'LIVE';
      query<HTMLElement>('[data-ref="status"]').textContent = state.status;
    },
    destroy(): void {
      abort.abort();
      pet.destroy();
      shell.remove();
    },
  };
}
