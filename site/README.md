# Jam Frog showcase site

The Hacklanta project page lives here. The seven-frog selector keeps the sprites
still at rest and shows the three-frame tongue greeting on hover or keyboard
focus. Selecting a frog opens its recording or a labeled silent illustration.

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

The website does not connect to Live, run model inference, or call Gemini. The
mode and weirdness examples are illustrative. Missing recordings have a silent
12-second animated preview, which can be played or downloaded locally.

## Build for hosting

From `app/`, run `npm run site:build`. The static website is generated in
`site/dist/`, including the shared sprites, font, recordings, and artwork. Upload
the contents of that folder to a static host, or publish it through Sites. Rebuild
and republish after adding or replacing media.

GoDaddy is the domain registrar for `jamfrog.us`; hosting serves the actual
website. The domain's DNS records connect those two. Hosting instructions and
the exact provider-returned records are recorded in `docs/website-hosting.md`.
