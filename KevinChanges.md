# Kevin's Jam Frog Changes

Repository PR audit as of October 11, 2026. This records the merged work associated with Kevin Gan (`Kevinsgans`), plus the other repository PRs for context. PR status and authorship are called out so teammate work and unmerged work are not misattributed.

## PR history

| PR | Author | Status | Summary |
| --- | --- | --- | --- |
| [#1 — GRU chord model](https://github.com/AlexS-127/jam-frog/pull/1) | Katie Duong | Merged | Added GRU training/export and the TypeScript `GruModel`, with parity and evaluation artifacts. The original PR reported 60.5% top-1 / 82.6% top-3; the shipped-model figures were later updated in the model README. |
| [#2 — Amp and sprite UI prototype](https://github.com/AlexS-127/jam-frog/pull/2) | Kevin Gan | Merged | Added the frog motion/controller foundation, pixel-art assets, overlay UI, and browser demo/review pages. |
| [#3 — Blind listening test page](https://github.com/AlexS-127/jam-frog/pull/3) | Kevin Gan | Closed, not merged | This PR proposed the listening-test page and supporting playback/session modules. It is not counted as a merged PR; the blind A/B feature reached `main` separately in commit [`f0eb52f`](https://github.com/AlexS-127/jam-frog/commit/f0eb52f994fe3883f1f11524b9db4dafc1981d2d), authored by Claude. |
| [#4 — Hackathon showcase site](https://github.com/AlexS-127/jam-frog/pull/4) | Kevin Gan | Merged | Created the standalone pixel-art website, interactive signal-path walkthrough, source/setup links, model results, and initial genre-frog art. |
| [#5 — Genre outfits and amp redesign](https://github.com/AlexS-127/jam-frog/pull/5) | Alex S-127 | Merged | Added genre-specific app outfits and redesigned the overlay as a guitar amp. This is teammate work, included here as context for the current app. |
| [#6 — Eight animated genre frogs](https://github.com/AlexS-127/jam-frog/pull/6) | Kevin Gan | Merged | Replaced the initial outfit approach with eight complete genre sprites and shared idle/performance animation support. |
| [#7 — Site refresh and demo tape](https://github.com/AlexS-127/jam-frog/pull/7) | Kevin Gan | Merged | Refreshed the showcase design, added one-click demo-video rendering, and aligned the app speech-bubble tail with the animated frog's mouth. |
| [#8 — Hackathon product and architecture story](https://github.com/AlexS-127/jam-frog/pull/8) | Kevin Gan | Merged | Added the problem/product framing, source-linked architecture map, business hypotheses and validation plan, licensing constraint, and corrected shipped-model figures. |

## Kevin's merged work

### PR #2 — App UI and sprite foundation

- Built the frog canvas controller and motion system, with distinct moods/actions and tests for motion and canvas fitting.
- Added the overlay UI styled around the frog, keyboard, and amp metaphor, plus demo/review pages for trying the renderer without Ableton.
- Added initial frog artwork and implementation notes for the sprite assets.

### PR #4 — Standalone hackathon site

- Added `site/` as a static showcase separate from the Electron renderer, with its own Vite preview command and artwork.
- Introduced the Play → Listen → Answer walkthrough, project/model explanations, repository links, and Ableton setup steps.
- Added the first website presentation of four genre frogs, including idle movement and occasional broad, downward frog-tongue animations.

### PR #6 — Complete genre animations

- Added full-body pixel-art sprites for Jazz, Rock, Punk, Alternative, Pop, Country, Electronic, and Rap.
- Gave each genre eight idle frames and eight instrument-playing frames. Clothes and instruments are part of each complete sprite, so the props stay aligned through movement.
- Added a shared animation mapping used by both the site preview and app overlay, along with tests for animation selection and rendering behavior.
- Matched the requested genre instruments: hollow-body rhythm guitar, Telecaster-style guitar, Ibanez-style rhythm guitar, offset electric guitar, acoustic piano, acoustic guitar, DJ deck, and microphone.

### PR #7 — Site refresh, generated demo, and bubble anchor

- Reworked the site as an editorial pixel-art field guide with responsive layouts.
- Added a one-click, browser-local render of a silent 12-second illustrated demo, with in-page playback and a download link. It does not record live Ableton or MIDI input.
- Updated the app's speech-bubble placement so its tail follows the frog's mouth across genre looks and animated poses.

### PR #8 — Hackathon narrative and business thinking

- Added the creative-workflow problem framing and explained the product's value hypothesis: a collaborator that listens and answers while the musician stays in Ableton.
- Added a module map from Frog Ear/OSC through `OnsetGrouper`, `detectChord`, `ChordModel`, `suggest`/`reshape`, `AnswerEngine`, voicing, and Frog Voice, with links to source files.
- Added a business section that identifies a first-user hypothesis, proposes usability/usage/listening-test validation, and avoids presenting traction, pricing, or product-market fit as established.
- Called out macOS/Live/Max for Live setup friction and the Chordonomicon CC BY-NC 4.0 data-rights question for any commercial path.
- Corrected the showcase's shipped-model results to match the README: n-gram 56.2% / 79.6%, GRU 61.5% / 83.3%, on the 20,000-section test sample (seed 0). The page clarifies that next-chord accuracy does not measure listening preference.

## Current result

The merged work provides a pixel-art Jam Frog app presentation, eight individually animated genre performers, a standalone hackathon showcase with an illustrative demo-video renderer, and a more complete explanation of the product, architecture, and business assumptions. The app's actual Ableton/MIDI behavior remains in the desktop app and Max for Live devices; the website walkthrough is illustrative.
