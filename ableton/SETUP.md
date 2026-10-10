# Connecting Jam Frog to Ableton Live 12

There are two bridges. Pick one in the overlay.

- **Ports (IAC Driver):** works today, nothing to install inside Live.
- **Max for Live (Frog Ear + Frog Voice):** coming in feature 5; answers land exactly on the bar.

## Ports bridge (IAC Driver)

_This section is updated with the exact steps as we take them._

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
