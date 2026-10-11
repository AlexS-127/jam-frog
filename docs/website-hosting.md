# Put Jam Frog online at jamfrog.us

The website is built and deployed through Sites. GoDaddy registers the domain;
you do not need to buy a GoDaddy website builder or hosting package to use it.

- Hosted site: https://jam-frog-bandmate.ampletapir9.chatgpt.site
- Domain: jamfrog.us
- Sites project ID: appgprj_6acb649e622481919fd44ea8262d53bb
- Hosting snapshot: /Users/alex/.codex/visualizations/2026/10/11/01a12a4f-e116-7e61-95cb-364b32b438f6/jam-frog-site

## 1. Make the hosted page public

The deployed page currently has owner-only access. Public access is separate from
DNS: a working domain would still show an access gate until the site is made public.
Tell Codex "Make the Jam Frog website public" to authorize that access change.
The public access decision was not made during this session.

## 2. Open the domain's DNS settings

Sign in to GoDaddy, open your Domain Portfolio, select jamfrog.us, and select DNS.
If the domain uses GoDaddy nameservers, its records are editable there.

The official instructions are:

- [Manage DNS records](https://www.godaddy.com/help/manage-dns-records-680)
- [Add or edit an A record](https://www.godaddy.com/help/add-or-edit-an-a-record-42546)
- [Add a CNAME record](https://www.godaddy.com/help/add-a-cname-record-19236)

## 3. Enter these records

These are the exact hosting-provider values returned on October 11, 2026. The
Name column is relative to jamfrog.us, as GoDaddy expects. Leave TTL at its default.

| Type | Name | Value |
| --- | --- | --- |
| A | @ | 162.159.143.30 |
| A | @ | 172.66.3.26 |
| TXT | _openai-site-verification | openai-site-verification=H06WH-6e9nb3Kt2eG-5SlpFQFrAClNufYsD4ncH7RxU |
| TXT | _cf-custom-hostname | 751457de-9526-4e81-a622-ab47e36dcc95 |
| CNAME | www | custom-domains.chatgpt.site. |
| TXT | _openai-site-verification.www | openai-site-verification=lpXQeIFq_YaFSQVGmo9LQMq3eQVutwUJtRdx2KE1Hs4 |
| TXT | _cf-custom-hostname.www | 991c9ff9-2d46-47cb-8e08-dfba7b6c0722 |

If there are existing parking A records for @, replace those with the two A values
above. Update an existing www CNAME instead of creating a conflicting second one.
Keep email records such as MX, SPF, and DKIM in place.

## 4. Validate the domain

After saving the DNS records, tell Codex "I added the jamfrog.us DNS records."
Codex can refresh domain verification for both hostnames and check certificate
status. The custom domains are currently pending DNS validation; HTTPS is not yet
confirmed. GoDaddy says most DNS updates take effect within an hour but can take
up to 48 hours globally.

Once public access, DNS, and the HTTPS certificate are ready, visitors can use
https://jamfrog.us and https://www.jamfrog.us.

## Add your recordings and artwork

Recordings go in /Users/alex/jam-frog/site/demo-videos/. Use all.mp4, jazz.mp4,
rock.mp4, punk.mp4, pop.mp4, country.mp4, and electronic.mp4. WebM also works;
optional captions use matching .vtt filenames.

The closing drawing goes in /Users/alex/jam-frog/docs/art/jam-frog.png. Supported
alternatives are JPG, WebP, AVIF, and SVG. Until that image exists, its section is
hidden.

Run npm run site:build from /Users/alex/jam-frog/app after changing content or media,
then republish the new site/dist snapshot. Local edits do not automatically update
the hosted website.
