# KalTech website

Marketing site for KalTech. Astro, static output, plain CSS on a locked token layer.
Read `CLAUDE.md` before changing anything: it holds the tokens, the standing rules and
the content rules.

## Commands

| Command | What it does |
|---|---|
| `npm run build` | Preview build into `dist/`, with clean URLs: `noindex,nofollow` on every page, a disallow-all `robots.txt`, no sitemap. What deploys before launch. |
| `npm run build:production` | Production build (`SITE_ENV=production`): indexable, `robots.txt` allowing crawlers, `sitemap.xml`, `llms.txt`. Fails, naming each page and string, while any `[PLACEHOLDER]` renders on an indexable page. What deploys at launch. |
| `npm run build:review` | The preview build, then every URL in `dist/` rewritten to a relative path so the site opens straight from the filesystem with no server. Review only. Do not deploy it. |
| `npm run verify` | Preview build, then every check in the table below except Lighthouse, `file://`, gates and launch, which are run on their own. |
| `npm run verify:launch` | The four builds the launch depends on: preview; production as the data stands (must fail); production with placeholders filled by a test value (must pass; sources restored and hash-checked); a changed inline script with the CSP hash left alone (must fail). Writes to `verification/launch/`, never `dist/`. |
| `npm run lastmod` | Records the modification date and hash of every file in `src/content/` in `src/data/lastmod.json`, which the production sitemap's `<lastmod>` reads. |
| `npm run verify:file` | Opens every page in `dist/` over `file://` in Chromium, WebKit and Firefox and checks CSS, fonts and links. Run it after `build:review`. |
| `npm run placeholders` | Regenerates the placeholder list below from source. |
| `npm run favicon` | Regenerates the icons and the share card in `public/` from the Sora font file, then wraps the 32px icon as `favicon.ico`. |
| `npm run geo` | Regenerates the world map's dot grids and country centroids in `src/data/` from Natural Earth 110m (`world-atlas`, a devDependency). Run it only if the map's density or crop changes; the output is committed and the build never needs it. |
| `npm run review:capture -- before\|after` | Screenshots the sixteen round-1 sections at 1440 and 375 into `verification/round1/`. |

Individual checks, all of which `npm run verify` runs in order:

| Check | What it proves |
|---|---|
| `verify:hex` | No colour literal outside `tokens.css`. |
| `verify:links` | Every internal link in `dist/` resolves. |
| `verify:nojs` | Every route renders complete with JavaScript disabled, with screenshots. |
| `verify:overflow` | No `min-width`, no horizontal scroll at 320px. |
| `verify:meta` | Title (ending " \| KalTech"), description (150-160), canonical, Open Graph, Twitter, icons and JSON-LD on every route, and the crawl files the build's mode calls for. |
| `verify:seo` | One URL per page (canonical, `og:url`, JSON-LD url, sitemap `<loc>`, internal links and the address that answers 200, all the same string, through a local stand-in for Vercel); titles and descriptions; one h1 and the heading outline of every route; depth from the homepage; `lang`; Open Graph and Twitter; robots, sitemap and `llms.txt` for the mode; CSP violations and the motion script in Chromium, WebKit and Firefox; every SVG named by its `<title>` and described by its `<desc>`; unique names on the case-study links; the 404. Takes `DIST=` for another build. |
| `verify:schema` | The JSON-LD `@graph` on every page against a fixed vocabulary per type, every `@id` reference resolved, values checked against the page (canonical, title, byline), forbidden types absent. Prints the URLs for Google's Rich Results Test. |
| `verify:redirects` | Every row of `docs/redirects.md` on the apex, `www` and preview hosts, every route and its slash form, the 404, and the headers, through `scripts/vercel-emulator.mjs`, which compiles `vercel.json` with Vercel's own `@vercel/routing-utils`. `ORIGIN=https://…` runs it against a live deployment instead. |
| `verify:red` | No more than five emphasis reds in any viewport height. |
| `verify:contrast` | Every text colour against the ground it sits on, derived from the built pages. |
| `verify:matrix` | Every route at 375 / 768 / 1024 / 1440, with overflow, clipping, orphan, grid, sticky and hover-at-rest checks. |
| `verify:motion` | JavaScript off, reduced motion, and every `.m-*` element settling within 2s. |
| `verify:devices` | Each per-page device, JS off against JS on, with screenshots. |
| `verify:lighthouse` | Performance, accessibility and best practices on every route, mobile and desktop. |
| `verify:file` | Every page opens over `file://` in Chromium, WebKit and Firefox. |
| `verify:round1` | The round-1 sections: every new visual complete with JavaScript off and final under reduced motion, no text under 12px at 320 and 375, the fit checks by keyboard, the new labels, the placeholder counts against the 16 September build, and before/after sheets. |
| `verify:justify` | Not in `verify`; the site is left-aligned by decision. Every `.t-justify` paragraph: widest word gap at or under twice the typeface's own space at eight widths from 769 to 1920 in Chromium, WebKit and Firefox, at least 55 characters per line, and nothing justified at or below 768. `candidates` mode measures the paragraphs in `verification/justify/manifest.json` without editing them. |
| `verify:gates` | Opens the three switched-off elements in a throwaway build with sample data, measures them, and restores the data files byte for byte. Nothing reaches `dist/`. |

## Logo

The header and footer wordmark is type-set, not an image: Sora 700 at
`clamp(19px, 1.7vw, 23px)`, -1.2px tracking, "KalTech" in `--ink` with the period in
`--accent`, inverting to `--paper` and `--accent-dark` over dark grounds. The PNGs in
`Brand/` are reference only and never appear on the page.

**Needed from the designer: an SVG wordmark.** Outlined letterforms, no embedded font, no
background, with the period as its own shape so it can be coloured separately.

Drop it at `src/assets/brand/kaltech-wordmark.svg`, then inline it in place of the text in
`src/components/Header.astro` (`.wordmark`) and `src/components/Footer.astro`
(`.ftr-wordmark`). Fill the letterforms with `currentColor` and give the period the class
`wordmark-dot`, and the existing colours, including the header inversion over dark
sections, keep working with no CSS change.

### Icons and the share card

`public/` holds four generated images: `favicon-32.png`, `icon-512.png`,
`apple-touch-icon.png` and `og-card.png`. All four are type-set from the real Sora 700
file by `npm run favicon`, which reads its colours from `tokens.css` — the K and the wordmark
in `--paper`, the period in `--accent-dark`, on `--deep`, matching the header over dark
sections. No brand PNG is used; all three have baked backgrounds.

**These are provisional.** When the SVG wordmark above arrives, rerun the script against it
so the icons carry the real letterforms. The share card is the wordmark alone: no strapline,
because no copy exists for one.

## Open copy decisions for the client

1. **Services, "Every stage has an exit."** The exit ladder is built exactly as the
   standalone Services copy words it. Card four reads "Ongoing: Reviewed at each interval
   against what it has moved, rather than renewed by default." It states no exit, which
   makes the section headline untrue for one of the four stages. This is an open copy
   decision for the client.

2. **The diagnostic's length is stated two ways.** Services says "Two to three weeks"
   twice; the Diagnostic says "[PLACEHOLDER] weeks" and "Duration: [PLACEHOLDER]". Left as
   supplied; the value filled in must agree with Services, or Services must change.

## When real values land

- **Figures.** Remove `.fig-pending` (`components.css`), the `pending` check in
  `Figure.astro`, and the block marked TEMPORARY in `pages.css`.
- **Diagnostic, "What the [PLACEHOLDER] weeks actually consist of."** The value is
  `weeks` in `src/data/diagnostic.json`, which also labels the end of the phase timeline. The
  accent sits on "weeks" only while the duration is a placeholder; when the real duration
  lands, move the accent onto the figure itself.

## Adding a case study

One file: `src/content/work/<slug>.md`. The slug becomes the route, `/work/<slug>`. It is
frontmatter only, no body. `src/content.config.ts` holds the schema and the build fails on
a missing or misshapen field, so copy an existing file and replace the values.

`order` sets the position on `/work` and in the "More work" cards. `cardCount` is the
number a figure counts up to, or `null` where the figure is not a number, as with `3→1`.
`imageGround` picks the placeholder block's ground; it is corrected automatically if it
would match the section it sits in. The case then appears on `/work`, on the homepage, and
in the other case studies' "More work" cards with no other edit.

## Adding an article

One file: `src/content/insights/<slug>.md`, route `/insights/<slug>`. Frontmatter plus a
markdown body.

`published: false` keeps a title in the repository without publishing it: no route is
built and it is listed nowhere. Set it true to publish. `featured: true` puts it at the top
of `/insights` and on the homepage; exactly one article should carry it. `contents` drives
the sticky index, and each entry's `id` must match an `id` in the body, so body headings are
written as HTML (`<h2 id="measured" data-body-block>`) rather than markdown. `titleAccent`
is the one word of the title set in red.

## Schema

One JSON-LD `@graph` per page, built in `src/lib/schema.ts`, every node with a stable `@id`.
Organization on every page (from `src/data/organization.json`, with `sameAs` the LinkedIn
company page and a provisional `logo`, the 512px icon, until the SVG wordmark arrives);
WebSite on the homepage; WebPage on every page; BreadcrumbList below the homepage; three
Service nodes on `/services`; Article on the insights article (author: the Person on the
byline) and on the three case studies (author: the Organization). No `datePublished` or
`dateModified`: the site states no dates. A value in `organization.json` left as
`[PLACEHOLDER]` is left out of the output rather than published.

## Redirects

`vercel.json` implements the approved map in `docs/redirects.md`: one 301 per old URL, `www`
to the apex, trailing slashes removed, and a 410 for the old pitch deck through
`api/gone.js`. `npm run verify:redirects` reads the table in that file, so the file and the
rules cannot drift. **None of it does anything until the site is deployed on Vercel.**

## Performance, and what each thing costs

`npm run verify:lighthouse` scores every route on mobile and desktop. `node
scripts/cost-ab.mjs` answers the separate question of what the design costs: it rebuilds
the homepage four more ways — grain off, fonts off, both off, and fonts preloaded — and
measures each the same way, Lighthouse mobile plus a 4x-throttled scroll.

Measured on the homepage, mobile:

| | Page weight | First paint | Frame cost |
|---|---|---|---|
| The grain overlay | 341 bytes, inline, no request | none measurable | none measurable |
| The four self-hosted faces | 63 KB | ~600 ms | none |
| Preloading those four faces | no change | ~600 ms back | none |

The grain is free. The fonts are the only real cost, and preloading recovers the paint
delay without changing a pixel. LCP varies about ±150 ms between runs, so read FCP.

**The preload is applied.** `Base.astro` imports the four `.woff2` files with `?url` and
emits a `<link rel="preload">` for each, so they are requested alongside the CSS instead of
after it: homepage FCP went from 1652 ms to 1051 ms on throttled mobile, with each file
still fetched exactly once. Only the latin subsets are preloaded — nothing on the site uses
latin-ext, and preloading it would cost more than it saves. If a fifth weight is ever added,
add its preload here too or it loads late.

`scripts/relativise.mjs` strips those four tags from the review build. A font is fetched in
CORS mode, so the tag carries `crossorigin`, and over `file://` the page has an opaque origin
and every one of those requests fails. The fonts still load from the stylesheet, so the
preload buys nothing there; left in, it puts four failed requests on every page of the review
build and `npm run verify:file` fails on all of them.

Deliberately not done: splitting the single 54 KB stylesheet per page. Lighthouse offers
about 150 ms of unused CSS on mobile for it, which is a bad trade against thirteen
separately-cached files at 99/100.

## Contrast, and the grain

Every pairing on the site meets WCAG AA on its specified colours; `npm run verify:contrast`
proves it against the built HTML rather than a list. Two of them have no room to spare:

| Text | Ground | Size | Raw | With the 3% grain composited | Grain budget |
|---|---|---|---|---|---|
| `--accent-dark` | `--deep` | 12px | 4.50 | 4.30 | 0.02% |
| `--muted` | `--slate` | 12–14px | 4.55 | 4.37 | 0.80% |

The decision taken: these pass. WCAG is assessed on specified colours, and the grain is a
3 percent decorative noise layer averaging to mid grey — it is not a colour change to the
text. The contrast report prints the composited column anyway so the cost is visible.

**What this means for anyone adding to the site: these two tokens carry zero headroom, so no
further overlay — a scrim, a tint, a wash, a second texture, anywhere on the site — may be
added without re-running `npm run verify:contrast` and reading the "w/ grain" column.** The
budgets above are the whole margin. A second 3 percent layer spends it twice.

## A known typographic compromise

At 1440 the second service line breaks as "AI and software / development", leaving one word
on the last line. `text-wrap: balance` is already applied; `text-wrap: pretty` produces the
same break and makes the third heading worse. The only other fix is rewording, which the
content rules forbid. This is accepted, not missed — `npm run verify:matrix` reports it as a
warning rather than a failure.

## The contact form

The form at `/contact` posts to `/api/contact`, a Vercel Serverless Function in `api/`
outside the Astro build. It is a stub: it accepts the POST, logs the fields and returns
200. **It logs what a visitor typed, including their name and email.** Replace the log in
`handler` with real delivery — email, CRM or queue — before the form takes production
traffic. The markup does not need to change. Nothing about it runs locally in `astro dev`
or in the `file://` review build, so a submission there does nothing.

## Sitemap, robots and llms.txt

`src/integrations/seo.mjs` writes all three after every build, from the pages Astro actually
built. So a page is listed only if it exists and is indexable, and its `<loc>` is its own
canonical. A preview build gets a disallow-all `robots.txt` and nothing else. A production
build gets a `robots.txt` that allows every crawler, names GPTBot, ClaudeBot, PerplexityBot
and Google-Extended, and points at the sitemap. It also gets `sitemap.xml` (absolute URLs,
no trailing slash, the 404 excluded) and `llms.txt` (every page with its title and
description, plus the LinkedIn page). `<lastmod>` appears only for the case studies and
articles, and only while the file's bytes still match the date recorded by `npm run lastmod`.
A build server's copy of a file has no reliable modification time.

The same hook is the launch gate. In a production build, any `[PLACEHOLDER]` on an indexable
page fails the build with every page and string listed, and empties the output directory. In
every build, it fails if the inline script's sha256 is not the one in the
Content-Security-Policy in `vercel.json`.

## Logo strip

The strip renders only names marked `"confirmed": true` in `src/data/footprint.json`, and
only once six are confirmed and the Clients gate (five confirmed countries) is open; until
then it is not drawn at all. Three names are confirmed today. With the gate closed, the
Clients section is its eyebrow and the testimonials only.
The export's other nine names appear nowhere else in any version of the site and were
removed as unverified.

When it returns, the names are text at 60 percent opacity, treated as a logotype exemption
from contrast. **If real logo images have not replaced that text by launch, the exemption no
longer applies** and the strip must go to `--muted` at 100 percent. The contrast report will
flag it again the moment it renders.

## Data files

Every value a round-1 diagram draws — a figure, a label, a country, a proportion — lives in
one file under `src/data/`, so filling a placeholder changes it everywhere at once.

| File | Holds |
|---|---|
| `footprint.json` | The record figures (read by the homepage and About), client names and countries with their `confirmed` flags, and the thresholds that open the Clients gate (`mapMin`) and the strip (`stripMin`) |
| `locations.json` | The About map's markers and arcs, and the working-hours strip with its `showOverlap` switch |
| `services.json` | The three service lines and the four engagement steps, verbatim |
| `diagnostic.json` | The Diagnostic copy that feeds a diagram: the incentive rows, the lenses, the phases, the returns and their facsimile labels, the fork on the homepage |
| `fit.json` | Both fit checks |
| `timelines.json` | Every timeline's segments. All illustrative |
| `lenses.json` | The two drawn lens diagrams. The numbers are illustrative |
| `sketches.json` | The interface sketches on `/work` |
| `about.json` | The About record labels, the not-counted row, the org shape labels |
| `land-dots.json`, `country-centroids.json` | Generated by `npm run geo`. Do not edit |

## Justified body text — tested, not used

The site is left-aligned by decision. Justification was tested on the 45 paragraphs that
qualified (running prose at body size, 55 or more characters per line at every width above
768), and 23 exceeded a 2x word gap in at least one engine and width; any partial application
left columns alternating between justified and ragged text. Instrument Sans has a narrow word
space, so at these measures loose lines come quickly.

The tooling stays, unused: the `.t-justify` utility in `base.css`, the empty
`src/data/justify.json` that the homepage, `/work` and case-study templates read, and
`npm run verify:justify` (no longer part of `npm run verify`). Anyone reconsidering must run
`node scripts/check-justify.mjs candidates` first; it measures the paragraphs in
`verification/justify/manifest.json` without editing them. Two findings from the test hold:
`text-wrap: pretty` makes justified lines looser in all three engines, and in Firefox
`document.fonts.ready` can resolve before a face is applied, so the check loads each font
before it measures.

## Drawing: two rules found the hard way

**Never combine `vector-effect: non-scaling-stroke` with `.m-draw`.** A drawn stroke uses
`pathLength="1"` so one dash covers the path; with a non-scaling stroke, all three engines
measure the dash in screen space and the draw breaks. Verified in Chromium, WebKit and
Firefox during round 1. Non-scaling strokes are fine on anything that fades rather than draws
(`.m-node`), such as the map's dots.

**A diagram with sentences in it is HTML, not SVG.** SVG text scales with its viewBox, so a
12px label in a full-width SVG is 8px at 1024. The fork, the routing diagram, the lens gate
and the timelines are HTML with 1px CSS lines drawn by `.m-rule`, so their words stay at full
size. SVG is kept for fixed-size drawings (the lens diagrams, the break-even chart, the org
shape) and for geometry that must scale (the map).

## Placeholders

Every unknown on the site is the literal string `[PLACEHOLDER]`. No other convention is in
use. The list is generated from source, so file and line are exact.

<!-- placeholders:start -->
**57** occurrences of `[PLACEHOLDER]` in **12** source files, rendering as **56** in the built site (see the notes for lines that render more than once). Regenerate with `npm run placeholders` after a build.

| # | Route | Source | n | Context | Note |
|---|---|---|---|---|---|
| 1 | `/insights/retrieval-versus-fine-tuning` | `src/content/insights/retrieval-versus-fine-tuning.md:66` | 2 | `Attributable accuracy [PLACEHOLDER] [PLACEHOLDER]` |  |
| 2 | `/insights/retrieval-versus-fine-tuning` | `src/content/insights/retrieval-versus-fine-tuning.md:67` | 2 | `Cost per query at volume [PLACEHOLDER] [PLACEHOLDER]` |  |
| 3 | `/insights/retrieval-versus-fine-tuning` | `src/content/insights/retrieval-versus-fine-tuning.md:68` | 2 | `Time to reflect a change [PLACEHOLDER] [PLACEHOLDER]` |  |
| 4 | `/insights/retrieval-versus-fine-tuning` | `src/content/insights/retrieval-versus-fine-tuning.md:69` | 2 | `Volume at which cost clears [PLACEHOLDER] [PLACEHOLDER]` |  |
| 5 | `/work/ahw-global` | `src/content/work/ahw-global.md:74` | 1 | `primary: "[PLACEHOLDER]"` |  |
| 6 | `/work/ahw-global` | `src/content/work/ahw-global.md:77` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 7 | `/work/ahw-global` | `src/content/work/ahw-global.md:79` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 8 | `/work/ahw-global` | `src/content/work/ahw-global.md:81` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 9 | `/work/ahw-global` | `src/content/work/ahw-global.md:83` | 1 | `…: Figures drawn from client-side reporting over [PLACEHOLDER].` |  |
| 10 | `/work/becs` | `src/content/work/becs.md:74` | 1 | `primary: "[PLACEHOLDER]"` |  |
| 11 | `/work/becs` | `src/content/work/becs.md:77` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 12 | `/work/becs` | `src/content/work/becs.md:79` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 13 | `/work/becs` | `src/content/work/becs.md:81` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 14 | `/work/becs` | `src/content/work/becs.md:83` | 1 | `…: Figures drawn from client-side reporting over [PLACEHOLDER].` |  |
| 15 | `/, /work, /work/ahw-global, /work/becs` | `src/content/work/kalpay.md:7` | 1 | `constraintFound: "[PLACEHOLDER]"` | KalPay constraint. Rendered by the case cards, not by the KalPay page itself. |
| 16 | `/work/kalpay` | `src/content/work/kalpay.md:27` | 1 | `value: "[PLACEHOLDER]"` |  |
| 17 | `/work/kalpay` | `src/content/work/kalpay.md:36` | 1 | `figure: "[PLACEHOLDER]"` |  |
| 18 | `/work/kalpay` | `src/content/work/kalpay.md:74` | 1 | `primary: "[PLACEHOLDER]"` |  |
| 19 | `/work/kalpay` | `src/content/work/kalpay.md:77` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 20 | `/work/kalpay` | `src/content/work/kalpay.md:79` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 21 | `/work/kalpay` | `src/content/work/kalpay.md:81` | 1 | `- value: "[PLACEHOLDER]"` |  |
| 22 | `/work/kalpay` | `src/content/work/kalpay.md:83` | 1 | `…: Figures drawn from client-side reporting over [PLACEHOLDER].` |  |
| 23 | `/about` | `src/data/about.json:22` | 1 | `…Figures verified against delivery records as at [PLACEHOLDER].",` | The date the record was verified. |
| 24 | `/diagnostic` | `src/data/diagnostic.json:3` | 1 | `"weeks": "[PLACEHOLDER]",` | The diagnostic length in weeks. Renders twice: the How it runs heading and its timeline scale. |
| 25 | `/diagnostic` | `src/data/diagnostic.json:4` | 1 | `"findingPages": "[PLACEHOLDER]",` | The finding length. Renders twice: the facsimile foot and the note beside it. |
| 26 | `/diagnostic` | `src/data/diagnostic.json:82` | 1 | `"[PLACEHOLDER] hours across the people who perform the work.",` | The hours asked of the client's staff. |
| 27 | `/diagnostic` | `src/data/diagnostic.json:91` | 1 | `"page": "[PLACEHOLDER]"` | One contents line of the finding facsimile: its page number. |
| 28 | `/diagnostic` | `src/data/diagnostic.json:98` | 1 | `"page": "[PLACEHOLDER]"` | One contents line of the finding facsimile: its page number. |
| 29 | `/diagnostic` | `src/data/diagnostic.json:105` | 1 | `"page": "[PLACEHOLDER]"` | One contents line of the finding facsimile: its page number. |
| 30 | `/diagnostic` | `src/data/diagnostic.json:112` | 1 | `"page": "[PLACEHOLDER]"` | One contents line of the finding facsimile: its page number. |
| 31 | `(not rendered)` | `src/data/footprint.json:24` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 32 | `(not rendered)` | `src/data/footprint.json:25` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 33 | `(not rendered)` | `src/data/footprint.json:26` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 34 | `(not rendered)` | `src/data/footprint.json:27` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 35 | `(not rendered)` | `src/data/footprint.json:28` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 36 | `(not rendered)` | `src/data/footprint.json:29` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false },` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 37 | `(not rendered)` | `src/data/footprint.json:30` | 1 | `{ "country": "[PLACEHOLDER]", "confirmed": false }` | A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map. |
| 38 | `(data)` | `src/data/services.json:37` | 1 | `…stic finding and delivered in stages, typically [PLACEHOLDER], with the existing operation live throughout an…` | Was `[X to Y]` in the standalone Services copy. |
| 39 | `(data)` | `src/data/services.json:57` | 1 | `…e the work outlasts a single build. Reviewed at [PLACEHOLDER] intervals against what it has moved, rather tha…` | Was `[X]` in the standalone Services copy. |
| 40 | `/diagnostic` | `src/pages/diagnostic.astro:19` | 1 | `{ label: 'Duration', value: '[PLACEHOLDER]' },` |  |
| 41 | `/diagnostic` | `src/pages/diagnostic.astro:20` | 1 | `{ label: 'Fee', value: '[PLACEHOLDER]' },` |  |
| 42 | `/diagnostic` | `src/pages/diagnostic.astro:290` | 1 | `<Figure value="[PLACEHOLDER]" label="Fixed fee, agreed in advance" />` |  |
| 43 | `/diagnostic` | `src/pages/diagnostic.astro:333` | 1 | `value="[PLACEHOLDER]"` |  |
| 44 | `/diagnostic` | `src/pages/diagnostic.astro:334` | 1 | `label="Of the last [PLACEHOLDER] diagnostics recommended less than the client as…` |  |
| 45 | `/diagnostic` | `src/pages/diagnostic.astro:338` | 1 | `<Figure value="[PLACEHOLDER]" label="Recommended nothing be built" size="md"…` |  |
| 46 | `/diagnostic` | `src/pages/diagnostic.astro:341` | 1 | `Figures cover [PLACEHOLDER].` |  |
| 47 | `/diagnostic` | `src/pages/diagnostic.astro:364` | 1 | `[PLACEHOLDER] came in asking for a` | Was `[PLACEHOLDER — KALPAY, PENDING CONSTRAINT CONFIRMATION]` in the export. |
| 48 | `/diagnostic` | `src/pages/diagnostic.astro:369` | 1 | `…ostic ran all three lenses. The binding one was [PLACEHOLDER].` |  |
| 49 | `/diagnostic` | `src/pages/diagnostic.astro:385` | 1 | `Scope requested · [PLACEHOLDER]` |  |
| 50 | `/diagnostic` | `src/pages/diagnostic.astro:389` | 1 | `Scope delivered · [PLACEHOLDER]` |  |
| 51 | `/privacy` | `src/pages/privacy.astro:19` | 1 | `[PLACEHOLDER]` |  |
| 52 | `/services` | `src/pages/services.astro:51` | 1 | `constraint: '[PLACEHOLDER]',` | KalPay constraint. Was `[process]` in the standalone Services copy. |
| 53 | `/terms` | `src/pages/terms.astro:19` | 1 | `[PLACEHOLDER]` |  |
<!-- placeholders:end -->
