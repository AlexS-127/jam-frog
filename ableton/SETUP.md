# Connecting Jam Frog to Ableton Live 12

There are two bridges. Pick one in the overlay.

- **Ports (IAC Driver):** works today, nothing to install inside Live.
- **Max for Live (Frog Ear + Frog Voice):** coming in feature 5; answers land exactly on the bar.

## Ports bridge (IAC Driver)

_This section is updated with the exact steps as we take them._

### 1. Create the virtual ports (Audio MIDI Setup)

Pending: written up after the walkthrough.

### 2. Tell Live about the ports (Preferences → Link, Tempo & MIDI)

- **JamFrog In:** Track output on; Remote and Sync off. Every input switch off.
- **JamFrog Out:** Track input on; Remote and Sync off. Every output switch off.

### 3. Tap track (player → app)

- A MIDI track whose input is your keyboard or "Computer Keyboard". **Never "All Ins"**: that would also pick up the frog's notes.
- Monitor: **In**. MIDI To: **JamFrog In**.

### 4. Frog track (app → instrument)

- An instrument track with input **JamFrog Out**, Monitor **In**.
