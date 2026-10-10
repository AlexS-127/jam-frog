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

### 3. Tap track (player → app)

- A MIDI track whose input is your keyboard or "Computer Keyboard". **Never "All Ins"**: that would also pick up the frog's notes.
- Monitor: **In**. MIDI To: **JamFrog In**.

### 4. Frog track (app → instrument)

- An instrument track with input **JamFrog Out**, Monitor **In**.
