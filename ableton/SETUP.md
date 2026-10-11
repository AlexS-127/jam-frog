# Connecting Jam Frog to Ableton Live 12

Jam Frog talks to Live through two Max for Live devices, Frog Ear and Frog Voice, over OSC on localhost.
(An earlier IAC-ports bridge was removed.)

## Max for Live bridge (Frog Ear + Frog Voice)

Built with Live 12 Suite and Max 9.1.5. The devices are `Frog Ear.amxd` and `Frog Voice.amxd` in this folder;
`*.maxpat.json` are text exports of the same patches. Frog Voice also loads `frog_genre.js` from this folder; keep
the two files together.

| Device | Goes on | Does |
| --- | --- | --- |
| Frog Ear | your instrument track (`Me`), before the instrument | passes MIDI through, and sends `/note <pitch> <velocity>` to `127.0.0.1:9001` |
| Frog Voice | the `Frog` track, before its instrument | plays `/note` received on port `9002`; on `/genre` switches the track's Instrument Rack to that genre's chain; sends `/tempo <bpm>` on load and on change, and `/bar` at each bar start while the transport plays |

### Using the finished devices

1. In Finder, Cmd+Shift+G → `~/jam-frog/ableton`.
2. Drag **Frog Ear.amxd** onto the `Me` track, left of the piano. Drag **Frog Voice.amxd** onto the `Frog` track, left of its instrument.
3. If macOS asks whether Live (or Electron) may find devices on your local network, click **Allow**. Everything stays on `127.0.0.1`.
4. Start the app. Press Space in Live: the overlay's footer shows `LIVE <bpm> BPM · BAR <n>`.

### How they were built (Max 9.1.5)

1. Live's browser → **Max for Live → Max MIDI Effect**, dragged onto the track; the device's **Edit** button opens Max.
   The default patch already has `midiin → midiout`; we kept it.
2. **Cmd+E** to unlock, then pasted the objects as JSON (Cmd+V). Max accepts the `{"boxes": [...], "lines": [...]}`
   clipboard format. Objects below the "Device vertical limit" line still run; they are just hidden in Live's device view.
   - Frog Ear: `midiin → midiparse → prepend /note → udpsend 127.0.0.1 9001` (+ `print FrogEar`).
   - Frog Voice: `udpreceive 9002 → route /note → midiformat → midiout` (+ `print FrogVoiceIn`);
     `live.thisdevice → t b 1`; its bang → `path live_set` → `live.path` (left outlet) → **right** inlet of
     `live.observer tempo` → `prepend /tempo`; its `1` → `metro 1n @quantize 1n` → `/bar`; both → `udpsend 127.0.0.1 9001`
     (+ `print FrogVoice`).
   - Frog Voice, genre switch: `route /note /genre`; its `/genre` outlet → `js frog_genre.js` → `print FrogGenre`.
3. **Test:** Max Console (Window → Max Console, Cmd+Shift+M). Playing a chord prints `FrogEar • /note 65 87` …
   and `… 0` on release. Loading Frog Voice prints `FrogVoice • /tempo 93.`; playing prints `FrogVoice • /bar`.
4. Saved with **File → Save As…**, Cmd+Shift+G → `~/jam-frog/ableton`, as `Frog Ear.amxd` / `Frog Voice.amxd`.

### Gotchas we hit

- **`live.thisdevice` does not fire when you save from the editor.** After the first save, Frog Voice printed no `/tempo`
  and sent no `/bar`. Fix: delete the device and drag the saved `.amxd` back in (a real load). Clicking the
  `path live_set` message box in the locked patcher is a quick way to test the tempo chain by hand.
- `live.observer` reports nothing until it gets an id in its **right** inlet; that is what `live.thisdevice` triggers.
- `/bar` only ticks while Live's transport is playing (the metro follows Live's transport).
- The Max editor opens devices **unlocked** (edit mode). That is normal; the copy inside Live runs either way.
- `udpreceiver • binding to port 9002` in the Console is normal, once per load.
- Only one Frog Voice can listen on port 9002 at a time; don't put it on two tracks.
- If the Max Console says `js: can't find file frog_genre.js`, the device was loaded from a copy away from this
  folder (e.g. after **Collect All and Save**). Load it from `~/jam-frog/ableton`, or freeze the device in Max.

## Tracks

- `Me`: your instrument (e.g. a piano preset), MIDI From your keyboard's notes port (for an Akai MPK mini IV:
  `MPK mini IV (MIDI Port)`, with **Track** ticked for it in Settings → Tempo & MIDI), Monitor **In**, **Frog Ear** before
  the instrument.
- `Frog`: **Frog Voice**, then an Instrument Rack with a sound per genre (below), Monitor **In**.

## A frog sound per genre

When you pick a genre in the overlay, the frog's track changes sound: Frog Voice moves the Chain Selector of the
first Instrument Rack on its track to the chain named after the genre. While Live plays, the switch waits for the next
bar line. Each chain carries its own instrument, effects and send levels, so you design all of it in Live.

One-time setup on the `Frog` track:

1. Put an **Instrument Rack** after Frog Voice (Cmd+G on an instrument, or drag one in from the browser).
2. Add one chain per genre and name each chain (Cmd+R) exactly like a genre in the overlay, in any order:
   `jazz`, `rock`, `electronic`, `country`, `pop`, `punk`. Add a chain named `all` for **All styles**; without one,
   All styles uses the first chain. You can leave genres out: picking a genre with no chain keeps the current sound.
3. Fill each chain with its instrument and effects (e.g. jazz: Electric piano + Chorus; punk: Operator lead +
   Pedal; country: keys + Reverb).
4. **Sends per genre:** show the rack's return chains, add e.g. a Reverb and a Delay return, and set each chain's send knobs in the chain list. They switch along with the chain.
5. Show the Chain Select editor (**Chain** button above the chain list), right-click the zones and choose
   **Distribute Ranges Equally**. Every chain must keep an equal slice. Redo this after adding or removing a chain.

**Test:** with the app running, pick a genre. The Max Console prints e.g. `FrogGenre: jazz -> chain 1 of 7, selector 9`. A `no chain named …` or `no Instrument Rack on this track` line tells you what to fix. Notes the frog is holding
are released before the switch so none hang on the old chain; the next chord plays on the new sound.

## Recording a jam

Record in Arrangement View; you get your chords and the frog's answers as clips on Live's bar grid.

**Why arming the Frog track records nothing (Max for Live bridge):** a MIDI track records the MIDI arriving at
its input, but Frog Voice *creates* the frog's notes inside the track, after the input. So the frog is recorded
on a separate track that listens to the Frog track's output.

One-time setup:

1. **Create a MIDI track** (Cmd+Shift+T) and rename it `Frog Rec` (Cmd+R). No instrument.
2. Set its **MIDI From** to **Frog**, and the box under it to **Post FX** (or **Frog Voice** if Live lists it).
3. Turn off **Settings → Record, Warp & Launch → Exclusive Arm**, or Cmd-click arm buttons to arm more than one.

Each jam:

1. **Arm `Me` and `Frog Rec`** (not `Frog`).
2. Tab to **Arrangement View**, press **Record** (F9), play. Space to stop.

Live 12's **Capture MIDI** also works on the armed tracks if you forgot to press Record.
