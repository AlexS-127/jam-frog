# Put Jam Frog online at jamfrog.us

The showcase is hosted by GitHub Pages and deployed automatically from `main`.
The domain can stay with its current registrar and DNS provider; no separate
website-builder package is required.

- Repository: https://github.com/AlexS-127/jam-frog
- Temporary Pages URL: https://alexs-127.github.io/jam-frog/
- Custom domain: https://jamfrog.us

## 1. Enable GitHub Pages

Open the repository's **Settings > Pages**. Under **Build and deployment**, set
the source to **GitHub Actions**. The workflow in `.github/workflows/pages.yml`
builds the Vite showcase and publishes `site/dist` whenever relevant files change
on `main`. It can also be started manually from **Actions**.

After the first successful deployment, enter `jamfrog.us` under **Custom domain**
and save it. Enable **Enforce HTTPS** once GitHub makes the option available.

## 2. Replace the old website records

Edit DNS wherever the authoritative DNS records for `jamfrog.us` are managed.
Delete conflicting parking records and the superseded OpenAI Sites records. Add
the following GitHub Pages records; leave TTL at its provider default.

| Type | Host | Value |
| --- | --- | --- |
| A | root (`@`, or blank if required by the provider) | 185.199.108.153 |
| A | root (`@`, or blank if required by the provider) | 185.199.109.153 |
| A | root (`@`, or blank if required by the provider) | 185.199.110.153 |
| A | root (`@`, or blank if required by the provider) | 185.199.111.153 |
| CNAME | www | alexs-127.github.io. |

In Porkbun's DNS form, leave **Host** blank for each root A record; entering `@`
there may create `@.jamfrog.us`. Update an existing `www` record rather than
creating a second conflicting one. Keep unrelated email records such as MX, SPF,
and DKIM.

The old `_openai-site-verification`, `_cf-custom-hostname`, OpenAI A records, and
`custom-domains.chatgpt.site` CNAME are not needed after this move.

## 3. Check DNS and HTTPS

DNS changes can take up to 24 hours to propagate. GitHub will issue the HTTPS
certificate after the records resolve correctly. Both `jamfrog.us` and
`www.jamfrog.us` should then lead to the same Pages site.

## Add your recordings and artwork

Recordings go in /Users/alex/jam-frog/site/demo-videos/. Use all.mp4, jazz.mp4,
rock.mp4, punk.mp4, pop.mp4, country.mp4, and electronic.mp4. WebM also works;
optional captions use matching .vtt filenames.

The current closing drawing is /Users/alex/jam-frog/docs/art/jf.png. The website
prefers jam-frog.* if supplied, then jf.*, then other supported images. JPG,
WebP, AVIF, and SVG are supported too. The alternate jf_transparent.png is
retained; the full drawing is selected so the handwritten message is complete.

Commit and push changed content or media to `main`; GitHub Actions will rebuild and
publish the website. For a local check, run `npm run site:build` from
`/Users/alex/jam-frog/app`.
