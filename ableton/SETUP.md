# Connecting Jam Frog to Ableton Live 12

There are two bridges. Pick one in the overlay.

- **Max for Live (Frog Ear + Frog Voice):** the default. Reports Live's tempo and bar starts, so answers land on the bar.
- **Ports (IAC Driver):** fallback, nothing to install inside Live.

Both can be set up at the same time; the overlay's **Bridge** dropdown picks which one the app uses.

## Max for Live bridge (Frog Ear + Frog Voice)

Built with Live 12 Suite and Max 9.1.5. The devices are `Frog Ear.amxd` and `Frog Voice.amxd` in this folder;
`*.maxpat.json` are text exports of the same patches.

| Device | Goes on | Does |
| --- | --- | --- |
| Frog Ear | your instrument track (`Me`), before the instrument | passes MIDI through, and sends `/note <pitch> <velocity>` to `127.0.0.1:9001` |
| Frog Voice | the `Frog` track, before its instrument | plays `/note` received on port `9002`; sends `/tempo <bpm>` on load and on change, and `/bar` at each bar start while the transport plays |

### Using the finished devices

1. In Finder, Cmd+Shift+G → `~/jam-frog/ableton`.
2. Drag **Frog Ear.amxd** onto the `Me` track, left of the piano. Drag **Frog Voice.amxd** onto the `Frog` track, left of its instrument.
3. If macOS asks whether Live (or Electron) may find devices on your local network, click **Allow**. Everything stays on `127.0.0.1`.
4. Start the app; Bridge = **Max for Live**. Press Space in Live: the overlay shows `Live: <bpm> BPM · bar <n>`.

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

## Ports bridge (IAC Driver)

## Ports bridge (IAC Driver)

### 1. Create the virtual ports (Audio MIDI Setup)

1. Cmd+Space, type `Audio MIDI Setup`, Enter. Then **Window → Show MIDI Studio** (Cmd+2).
2. Double-click the **IAC Driver** icon (it is dim when offline). The **IAC Driver Properties** window opens.
3. Tick **Device is online**.
4. In the Ports list, double-click **Bus 1** and rename it `JamFrog In` (Enter to confirm).
5. Click **+** under the list, and rename the new port `JamFrog Out`.
6. Close the window (click **Apply** first if your macOS shows one), then quit and reopen Live so it sees the ports.

### 2. Tell Live about the ports (Settings → Tempo & MIDI)

Live 12: **Live → Settings…** (Cmd+,) → **Tempo & MIDI** tab. At the bottom, Live lists the ports as
"IAC Driver (JamFrog In)" and "IAC Driver (JamFrog Out)" in two tables. Live ticks **Track** on every new
input port by default, so one of them has to be switched off:

```
Input Ports                   Track  Sync  Remote  MPE
  IAC Driver (JamFrog In)      [ ]    [ ]   [ ]    [ ]   <- must be OFF, or your notes come back doubled
  IAC Driver (JamFrog Out)     [✓]    [ ]   [ ]    [ ]

Output Ports                  Track  Sync  Remote
  IAC Driver (JamFrog In)      [✓]    [ ]   [ ]
  IAC Driver (JamFrog Out)     [ ]    [ ]   [ ]
```

If you use a USB keyboard, also tick **Track** on its *notes* input port in the same Input Ports table.
For an **Akai MPK mini IV** that is **MPK mini IV (MIDI Port)** (off by default when Live sets the MPK up as a
Control Surface; leave the Control Surface as it is).

### 3. Show the track I/O boxes

**View → In/Out** (Cmd+Option+I). Works in Session or Arrangement View.

### 4. Tap track (player → app)

A MIDI track with **no instrument**, named `Tap`:

- **MIDI From:** your keyboard's notes port (e.g. `MPK mini IV (MIDI Port)`) or `Computer Keyboard`; All Channels.
  **Never "All Ins"**: that would also pick up the frog's notes and loop them.
- **Monitor:** In.
- **MIDI To:** `IAC Driver (JamFrog In)`, Ch. 1.

### 5. Your instrument track (so you hear yourself)

Drag any piano preset from the browser into the empty area below the tracks; rename it `Me` (Cmd+R).

- **MIDI From:** the same keyboard port as the Tap track. **Monitor:** In. Output: Main.

### 6. Frog track (app → instrument)

Drag a contrasting instrument (electric piano, mallet…) below the tracks; rename it `Frog`.

- **MIDI From:** `IAC Driver (JamFrog Out)`, All Channels. **Monitor:** In. Output: Main.

**Check:** play a chord. Only your piano sounds, and the Tap track's MIDI meter flickers. The Frog track stays
silent until the app answers.

### Switching from the computer keyboard to a USB keyboard later

Change **MIDI From** on both `Tap` and `Me` to the keyboard's notes port (and tick its Track box in Settings).
