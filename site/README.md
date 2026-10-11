# Jam Frog showcase site

The Hacklanta project page lives here. The opening screen is full-height white,
with the name, a question, and seven still frogs. Hover or keyboard focus enlarges
the chosen frog slightly without a tongue animation. Navigation appears after
scrolling or selecting a frog. Selecting opens its recording or a labeled silent
illustration.

The All styles frog uses `assets/default-frog.png`, a transparent cutout of Alex's
attached Gemini-generated sprite. The cutout was made with the built-in image
generation tool using this prompt: "Remove only the charcoal gray background;
preserve the frog's pose, colors, face, dark outline, and square pixel edges.
Transparent PNG, no tongue, no shadows, no redesign."

```sh
cd app
npm run site
```

Vite serves the site at `http://127.0.0.1:5173` (or the next port if that one is busy). The showcase is illustrative; it does not connect to Ableton or process MIDI.

## Add demo recordings and the final drawing

Put recordings in `site/demo-videos/`: `all.mp4`, `jazz.mp4`, `rock.mp4`,
`punk.mp4`, `pop.mp4`, `country.mp4`, and `electronic.mp4`. WebM is supported too.
Optional captions are `all.vtt`, `jazz.vtt`, etc. See that folder's README.

Put the closing drawing in `docs/art/jam-frog.png` (or another supported image
format). It appears at the end of the page automatically. If there is no image,
the section remains hidden rather than showing a broken placeholder.
The current drawing is `docs/art/jf.png`, which takes priority over the alternate
transparent version so the handwritten thank-you remains complete.

The website does not connect to Live, run model inference, or call Gemini. The
mode and weirdness examples are illustrative. Missing recordings have a silent
12-second animated preview, which can be played or downloaded locally.

## Build for hosting

From `app/`, run `npm run site:build`. The static website is generated in
`site/dist/`, including the shared sprites, font, recordings, and artwork. GitHub
Pages builds and publishes that folder automatically after relevant changes land
on `main`. The workflow can also be run manually from the repository's Actions tab.

Pitch, judge Q&A, and the submission checklist live in
`docs/hackathon-pitch.md`. The durable team history is in `docs/project-story.md`.

Domain registration, DNS, and hosting are separate. GitHub Pages hosts the site;
the DNS records for `jamfrog.us` connect the domain to it. Setup instructions are
recorded in `docs/website-hosting.md`.
