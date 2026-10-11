import { GENRES } from '../../core/vocab';
import { createOverlay, type Handlers, type UiState } from './overlay';
import { ACTIONS, type Action } from './frog/motion';

const root = document.querySelector<HTMLElement>('#demo-root')!;
root.innerHTML = `
  <main class="demo-page">
    <header class="demo-heading">
      <div class="demo-mark" aria-hidden="true">🐸</div>
      <div><p class="eyebrow">LANE B · OVERLAY PROTOTYPE</p><h1>Meet Jam Frog</h1></div>
      <p class="demo-intro">Your chord companion, now ready to play.</p>
    </header>
    <div class="demo-layout">
      <section class="preview-column" aria-label="Frog preview">
        <div class="stage-label"><span>OVERLAY PREVIEW</span><span>440 × 640</span></div>
        <div class="preview-surface" data-ref="stage"></div>
        <p class="gesture-hint">The frog sits on the amp · use the controls to explore</p>
      </section>
      <aside class="demo-controls" aria-label="Demo controls">
        <div class="control-heading"><span class="eyebrow">PLAYGROUND</span><span class="live-dot">MOCK DATA</span></div>
        <label class="control-field" for="action-select"><span>Frog action</span>
          <select id="action-select" data-control="action"><option value="">Automatic</option></select>
        </label>
        <label class="control-field" for="mood-select"><span>Music mood</span>
          <select id="mood-select" data-control="mood">
            <option value="idle">Ready</option><option value="listening">Listening</option>
            <option value="thinking">Thinking</option><option value="weird">Weird</option>
          </select>
        </label>
        <label class="ambient-toggle" for="ambient-toggle">
          <span><strong>Ambient gestures</strong><small>Occasional idle actions</small></span>
          <input id="ambient-toggle" data-control="ambient" type="checkbox" checked />
        </label>
        <label class="ambient-toggle" for="music-toggle">
          <span><strong>Play a frog answer</strong><small>Show keyboard performance</small></span>
          <input id="music-toggle" data-control="music" type="checkbox" />
        </label>
        <button class="reset-button" type="button" data-action="next">Next mood</button>
        <button class="reset-button" type="button" data-action="reset">Center frog</button>
        <div class="mock-copy">Listening shows next-chord suggestions; between phrases, the amp shows the frog’s answer.</div>
        <div class="readout">
          <span class="eyebrow">TELEMETRY</span>
          <dl><div><dt>Action</dt><dd data-ref="action">Loading</dd></div>
            <div><dt>Frame</dt><dd data-ref="frame">—</dd></div>
            <div><dt>Position</dt><dd data-ref="position">—</dd></div>
            <div><dt>Interaction</dt><dd data-ref="interaction">Resting</dd></div></dl>
        </div>
        <p class="keyboard-hint">Tab to focus the frog; press Enter or Space to react.</p>
      </aside>
    </div>
  </main>`;

const stage = root.querySelector<HTMLElement>('[data-ref="stage"]')!;
const actionSelect = root.querySelector<HTMLSelectElement>('[data-control="action"]')!;
const moodSelect = root.querySelector<HTMLSelectElement>('[data-control="mood"]')!;
const ambientToggle = root.querySelector<HTMLInputElement>('[data-control="ambient"]')!;
const musicToggle = root.querySelector<HTMLInputElement>('[data-control="music"]')!;
const actionReadout = root.querySelector<HTMLElement>('[data-ref="action"]')!;
const frameReadout = root.querySelector<HTMLElement>('[data-ref="frame"]')!;
const positionReadout = root.querySelector<HTMLElement>('[data-ref="position"]')!;
const interactionReadout = root.querySelector<HTMLElement>('[data-ref="interaction"]')!;
for (const [action, details] of Object.entries(ACTIONS) as [Action, (typeof ACTIONS)[Action]][]) {
  actionSelect.add(new Option(details.label, action));
}

const state: UiState = {
  mood: 'idle', phase: 'listening', bar: 2, bars: 4,
  yourChords: [{ name: 'Cmaj7', beat: 0 }, { name: 'Am7', beat: 4 }, { name: 'F#m7b5', beat: 8 }, { name: 'B7', beat: 10 }, { name: 'C#maj7', beat: 12 }],
  frogChords: [{ name: 'Dm7', beat: 0 }, { name: 'G7', beat: 4 }, { name: 'Cmaj7', beat: 8 }, { name: 'A7', beat: 14 }], frogIndex: 1,
  nextChords: [{ name: 'Dm7', beat: 0 }, { name: 'Db7', beat: 6 }, { name: 'Cmaj7', beat: 8 }],
  key: 'C major', keyChange: null, beat: { barAt: 0, barMs: 2000 },
  report: null, reportPending: false, reportBubble: false, reportMode: 'local', geminiAvailable: false, chordNames: 'letters', userAmple: true,
  suggestions: ['G7', 'Dm7', 'Ab'], borrowed: false,
  weirdness: 0.24, genre: 'jazz', phraseBars: 4, frogMode: 'answer', rhythm: false, model: 'gru', bpm: 120,
  liveTempo: 120, liveBar: 18, status: '',
};
let moodIndex = 0;
const moods: UiState['mood'][] = ['idle', 'listening', 'thinking', 'weird'];

let overlay: ReturnType<typeof createOverlay>;
const handlers: Handlers = {
  onWeirdness(value) { state.weirdness = value; overlay.update(state); },
  onGenre(value) { state.genre = value; overlay.update(state); },
  onFrogMode(value) { state.frogMode = value; overlay.update(state); },
  onStop() { state.phase = 'idle'; overlay.update(state); },
  onPhraseBars(value) { state.phraseBars = value; state.bars = value; overlay.update(state); },
  onRhythm(value) { state.rhythm = value; overlay.update(state); },
  onUserAmple(value) { state.userAmple = value; overlay.update(state); },
  onModel(value) { state.model = value; overlay.update(state); },
  onBpm(value) { state.bpm = value; overlay.update(state); },
  onReportMode(value) { state.reportMode = value; overlay.update(state); },
  onChordNames(value) { state.chordNames = value; overlay.update(state); },
};
overlay = createOverlay(stage, handlers);
const pet = overlay.pet;
overlay.update(state);
pet.subscribe((snapshot) => {
  actionReadout.textContent = snapshot.loaded ? ACTIONS[snapshot.action].label : 'Loading artwork…';
  frameReadout.textContent = String(snapshot.frame + 1).padStart(2, '0');
  positionReadout.textContent = `${Math.round(snapshot.position.x)}, ${Math.round(snapshot.position.y)}`;
  interactionReadout.textContent = snapshot.interaction[0].toUpperCase() + snapshot.interaction.slice(1);
});

actionSelect.addEventListener('change', () => pet.preview(actionSelect.value === '' ? null : actionSelect.value as Action));
moodSelect.addEventListener('change', () => {
  moodIndex = moods.indexOf(moodSelect.value as UiState['mood']);
  state.mood = moods[moodIndex];
  state.phase = state.mood === 'listening' ? 'listening' : 'idle';
  actionSelect.value = '';
  pet.preview(null);
  overlay.update(state);
});
ambientToggle.addEventListener('change', () => pet.setAmbientEnabled(ambientToggle.checked));
musicToggle.addEventListener('change', () => {
  state.phase = musicToggle.checked ? 'playing' : 'listening';
  overlay.update(state);
});
root.querySelector<HTMLButtonElement>('[data-action="next"]')!.addEventListener('click', () => {
  moodIndex = (moodIndex + 1) % moods.length;
  state.mood = moods[moodIndex];
  state.phase = state.mood === 'listening' ? 'listening' : 'idle';
  moodSelect.value = state.mood;
  actionSelect.value = '';
  pet.preview(null);
  state.borrowed = state.mood === 'weird';
  overlay.update(state);
});
root.querySelector<HTMLButtonElement>('[data-action="reset"]')!.addEventListener('click', () => pet.resetPosition());
window.addEventListener('pagehide', (event) => { if (!event.persisted) overlay.destroy(); });
