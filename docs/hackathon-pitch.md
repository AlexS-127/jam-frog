# Jam Frog: three-minute pitch and judge Q&A

**Elevator pitch:** Jam Frog is an AI bandmate inside Ableton Live that turns
your unfinished chord progression into a musical conversation, without taking
the song out of your hands.

The supplied Hacklanta 2026 Hacker Guide specifies **3 minutes to pitch and
2 minutes for Q&A**. The schedule below includes the website and live audio.
Read only the quoted paragraphs aloud. Bracketed notes are stage directions.
Rehearse to a stopwatch; leave silence for the music instead of talking over it.

## Before approaching the judges

- One presenter speaks; one teammate operates Live. Katie can handle model
  questions and Kevin the interface/website questions. Avoid slow handoffs.
- Open the website at the top in one tab and the running Live set/overlay in
  another window. Keep the setup guide and model results available for Q&A.
- Use a tested instrument chain. Set 120 BPM, a two-bar phrase, Answer mode,
  low weirdness, and **Jam report -> On this Mac only**. Turn off Ample strum for
  a synth/piano chain; use the correct Detect-mode rack for guitar.
- Rehearse one easy phrase, such as C major for one bar and F major for one bar.
  Start Live's transport before presenting. Check speakers, monitoring, Frog Ear,
  Frog Voice, genre chain names, and note-off behavior.
- Have a local screenshot and working local site as a no-network fallback.
  The site's silent illustrated preview is not evidence of working Live MIDI.

## Timed script

### 0:00-0:25 | The problem and the promise

[Website open on the white frog selector.]

> You find a chord progression you love, and then get stuck: what comes next?
> Jam Frog is an AI bandmate inside Ableton Live. It listens to your playing,
> suggests a next move, and takes a musical turn, while you stay the songwriter.

### 0:25-0:45 | Show the website and musician-first idea

[Hover two frogs, then scroll to the Ableton workflow/custom-preset section.
Do not open a missing recording during the pitch.]

> Our website starts with a question: which one are you? These genres are
> starting points, not boundaries. All styles leaves room for ambient sounds
> and hybrids. Because the frog plays through your own Live instruments and
> effects, its sound can fit the session you already have.

### 0:45-1:40 | Live musical conversation

[Switch to Live. Play the rehearsed two-bar phrase. Let the full two-bar frog
answer sound without narration: about eight seconds for both turns at 120 BPM.
Then switch to Jam, play a phrase, and improvise briefly over the frog.]

> Here's the real app. I'm playing two bars. The frog recognizes the chords
> and answers on the next downbeat.

[Listen. Point to the chord timeline.]

> In Jam mode it keeps playing, and previews what comes next. I can improvise
> over it. This weirdness control steers familiar or more adventurous choices;
> the change affects the next planned phrase. I can record the MIDI in Live and
> edit it like the rest of my music.

[Turn weirdness once; hear the next phrase if time allows. Press Stop.]

### 1:40-2:10 | How we built it and what was hard

> We connected an Electron and TypeScript overlay to two custom Max for Live
> devices: Frog Ear listens and Frog Voice plays. We trained a genre-conditioned
> GRU on Chordonomicon and run it locally. The hard part was making it behave
> like a musician: grouping staggered notes, choosing playable voicings, keeping
> bar timing, and releasing notes when instruments change.

### 2:10-2:40 | Zero Data Challenge and honest Gemini use

[Show the local report, then briefly show the website's privacy section.]

> For Shock Tracker's Zero Data Challenge, this local workflow needs no Jam
> Frog account, tracking, profile, or stored personal information. The jam and
> this report stay on the Mac. Gemini is a separate optional explanation mode:
> it receives chord and session facts, not audio or raw MIDI. It is never needed
> to play. We keep it off for the local-only demonstration.

### 2:40-3:00 | Close

> Alex built the Live integration, Katie developed the GRU, and Kevin built
> the visual experience, with AI coding assistants throughout. Next we're
> testing with musicians and reducing setup friction. Our goal is simple:
> help you find your next musical idea without replacing your creative process.

[Finish by 2:55 if possible, leaving five seconds for a transition to questions.]

## When the live demo misbehaves

If sound is not working within ten seconds, say: "The audio routing is failing
in this setup. Here is the chord timeline and our tested signal path; we can
show the working recording separately." Do not call the website illustration
a real demo. Skip the second Jam phrase before sacrificing the privacy point
or running over three minutes.

## Possible judge Q&A

**How is this different from generating a song with AI?**

We respond to what the musician is already playing, a chord or phrase at a
time. They choose the mode, harmonic adventurousness, instruments, and what to
keep. The output is editable MIDI in their existing Live workflow, not a finished
song that replaces the whole process.

**Why integrate with Ableton?**

It gives us the musician's instruments, effects, tempo, recording, and arrangement
environment. Our custom Max for Live bridge listens and plays on separate tracks.
The user does not have to rebuild their sound in another music app.

**Does it work for every genre? Does it recognize ambient automatically?**

Every-musician design is our philosophy, not a claim of universal accuracy.
There are six presets plus an unconditioned All styles option. All styles can
continue ambient-like chord progressions without labeling them ambient; the
texture comes from a custom Live rack. Today's input is MIDI chords, not audio.

**What does the AI actually do?**

The local GRU predicts possible next-chord tokens from recent chord movement and
genre context. An n-gram model provides a baseline and alternative. Key, voice
leading, cadence, repetition, and weirdness controls turn predictions into a
playable response. Gemini does not choose the real-time chords.

**Why a GRU, and how did you evaluate it?**

A compact recurrent model can use recent chord context and run locally. On the
same 20,000-section test sample, it reached 61.5% top-1 and 83.3% top-3 accuracy,
versus 56.2% and 79.6% for the n-gram. Those are next-chord prediction scores,
not a music-quality score. We also built a blind A/B listening tool; we have not
claimed a completed preference study.

**What does weirdness change?**

It steers choices toward more adventurous harmonic options, including borrowed
chords and secondary dominants, while retaining a connection to the key. During
a jam it re-plans the next available block, not the chords already sounding.

**What exactly goes to Gemini?**

Only when the optional mode is enabled with an API key: a symbolic post-jam
summary containing chord names, Roman numerals, bars, key changes, tempo,
musical events, and statistics. No audio or raw MIDI notes are included. The key
stays in the main process. These musical facts still leave the machine, so we
never describe Gemini mode as zero-data or fully offline.

**Does optional Gemini use conflict with the Zero Data Challenge?**

The local desktop path works without a Jam Frog account or cloud call and does
not persist session data. We are demonstrating that path with local reporting.
The optional Gemini path is a separate tradeoff. Final eligibility is the
organizers' decision; we will ask whether the optional API feature affects
entry, rather than imply that we have already been approved.

**Are you storing user data or training on users' music?**

The app keeps the current session in memory for playback and analysis; it does
not persist the session or train from it. Users can deliberately record in
their own Live set. Training used Chordonomicon, not captured hackathon users.
The app has no analytics or tracking. Hosting providers can have their own
access logs; our local-only claim is about the desktop workflow, not a promise
about every service's infrastructure.

**What did each teammate build, and did you use AI tools?**

Alex handled Ableton integration, playback, and workflow refinements; Katie
developed the GRU; Kevin built the visual interface, genre animations, and
original website. AI coding assistants helped throughout. We used shared
interfaces, mocks, and tests because only one teammate had Live available.
We disclose the dataset, open-source dependencies, and generated visual assets.

**Can you sell it?**

This is a hackathon prototype, not a validated business. Chordonomicon is
CC BY-NC 4.0, so we would resolve training-data rights before commercial use.
Our immediate next step is musician feedback and simpler installation.

**What's actually next, rather than already built?**

Musician testing and setup improvements first. Possible Live integrations
include automatically created editable MIDI clips, rack macros, Push controls,
scene-following, and audio-to-MIDI input. The website labels these possibilities
separately from working features.

## Remaining hackathon checklist (apart from recording videos)

1. **Verify the deadline with organizers now.** The supplied guide says all
   materials must be submitted by **9:00 AM Eastern, Sunday October 11, 2026**;
   judging is 9:30-11:30 AM. It says no exceptions. This is a provided export,
   not confirmation that the schedule has not changed. Ask about any changes
   and about post-deadline edits before pushing new judging material.
2. **Submit both forms.** One teammate submits Devpost and the separate Google
   Form from Discord. The guide requires both, a team roster, one main track,
   and at most three side challenges. Creative is the project's main-track
   framing; confirm your selected challenges and Zero Data eligibility.
3. **Make judge links accessible.** The guide requires a public GitHub repo,
   useful README, accessible demo/run instructions, and disclosure of prior
   work. The hosted website is currently owner-private until public access is
   authorized. Add the GoDaddy records and validate HTTPS before relying on
   `jamfrog.us`; use the hosted URL as backup after making it public.
4. **Commit the actual submission snapshot.** Review the pending site/document
   edits and latest app, Ableton, and sprite work with teammates, then test and
   commit/push the intended version. Do not reset somebody else's work.
5. **Check the final drawing.** The website uses `docs/art/jf.png`, preserving
   the full handwritten message. Verify it on the published page. The alternate
   `jf_transparent.png` is retained, but is not the selected closing artwork.
6. **Run a full Live smoke test.** Confirm input recognition, the two-bar answer,
   continuous Jam, weirdness re-planning, genre switching, Stop/note-off cleanup,
   and the local report. Test the exact set and speaker setup you will use.
7. **Check secrets and credits.** Never commit `.env.local` or API keys. Credit
   Chordonomicon, generated artwork, libraries, and AI assistance. Identify
   anything that existed before the event with the team; do not guess dates.
8. **Rehearse and simplify.** Time the full three-minute sequence twice, including
   window changes and musical silence. Charge the laptop, disable notifications,
   prevent sleep, and keep a no-network fallback ready. Pick one memorable
   response rather than racing through every feature.

## Guide source

Prepared against Alex's supplied **Hacklanta 2026 Hacker Guide** export, sections
"Shock Tracker: Zero Data", "Submissions", and "Procedure for Judging".
Project facts were checked against the local source, model README, Ableton setup
guide, and team build notes before those temporary notes were removed.
