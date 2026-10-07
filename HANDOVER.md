# KalTech website — handover

This is the whole site: eleven public pages plus a privacy and a terms page, thirteen routes
in all, built with Astro and plain CSS and output as static files. There is no database, no
CMS and no client-side framework. Everything on the site comes from files in this
repository.

Three documents matter, in this order:

- **`HANDOVER.md`** (this file) — how to run it, how to deploy it, what still needs
  filling in, and what must not be undone.
- **`README.md`** — how the build is put together, every verification command and what
  each one proves.
- **`CLAUDE.md`** — the design tokens, the layout rules and the content rules. Read it
  before changing anything visual.

---

## 1. Running, building and previewing

Node 20 or newer. Install once with `npm install`.

| Command | What it does | What the output is for |
|---|---|---|
| `npm run dev` | Development server on `http://localhost:4321`, reloads on save | Working on the site |
| `npm run build` | The **preview** build into `dist/`. Every page carries `noindex,nofollow`, `robots.txt` disallows everything, and there is no sitemap and no `llms.txt`. `[PLACEHOLDER]` is allowed | Everything before launch: the Vercel preview at kaltech-site.vercel.app, and any review deploy |
| `npm run build:production` | The **production** build into `dist/` (`SITE_ENV=production`). Indexable, `robots.txt` allows crawling and names the sitemap, `sitemap.xml` and `llms.txt` are written. **It fails while any `[PLACEHOLDER]` renders on an indexable page**, naming each page and string, and leaves `dist/` empty | **What goes to kaltech.online at launch, and only then** |
| `npm run preview` | Serves the last build locally | Checking a build before deploying |
| `npm run build:review` | The preview build, then every URL in `dist/` rewritten to a relative path | Opening `dist/index.html` straight from the filesystem, no server, to review the site |
| `npm run verify` | The preview build, then every automated check | Before handing work on or deploying |
| `npm run verify:launch` | Four real builds: preview, production as the data stands (must fail), production with placeholders filled by a test value (must pass; sources restored and hash-checked), and a CSP drift test (must fail) | Proving the launch gate and the crawl controls still work |
| `npm run lastmod` | Records each case study's and article's modification date against a hash of its bytes, in `src/data/lastmod.json` | After editing any file in `src/content/`, so the sitemap's `<lastmod>` stays true |

**The three builds are not interchangeable.** `npm run build` and `npm run build:production`
produce clean URLs (`/work/kalpay`) that need a web server; they differ only in whether search
engines are invited in. `npm run build:review` rewrites those URLs to filesystem paths
(`../work/kalpay/index.html`) so the site can be opened by double-clicking a file — useful
for review, broken as a website. All three write to the same `dist/` folder, so whichever you
ran last is what is sitting there. Never deploy the output of `build:review`.

**`SITE_ENV`** is the one switch: unset (or `preview`) means the preview build,
`production` means the production build. Any other value stops the build. It is read from
the shell or from a `.env` file.

The review build also drops the four font preload tags, which cannot be fetched over
`file://`. That is the only difference in content between the two builds; everything else is
URL rewriting.

`README.md` lists the individual checks — contrast, Lighthouse, the screenshot matrix,
motion with JavaScript disabled, and the rest — and what each one proves.

---

## 2. Deploying

`dist/` is a folder of static files: HTML, CSS, `.woff2` fonts and PNGs. No server runtime.
It can be dropped on any static host — Vercel, Netlify, Cloudflare Pages, S3 and CloudFront,
or a plain web server.

**Environment variables.** All three are read at build time; set them in Vercel under
Settings → Environment Variables, for the environment named.

| Variable | Set it to | Where | Effect |
|---|---|---|---|
| `SITE_ENV` | `production` | Production environment only, **at launch** | Makes the production build. Before launch, leave it unset everywhere: with placeholders still on the pages, a production build fails, and the failed deployment leaves the previous one live |
| `GOOGLE_SITE_VERIFICATION` | The `content` value of Search Console's HTML-tag method (the string only, not the tag) | Production | Emits `<meta name="google-site-verification">` on every page. Absent when unset |
| `BING_SITE_VERIFICATION` | The `content` value of Bing Webmaster Tools' `msvalidate.01` tag | Production | Emits `<meta name="msvalidate.01">` on every page. Absent when unset |

**The preview stays out of search three ways.** The preview build puts `noindex,nofollow` on
every page and serves a disallow-all `robots.txt` with no sitemap. And `vercel.json` sends
`X-Robots-Tag: noindex` on every response whose host is not `kaltech.online`, so the
`*.vercel.app` addresses stay out of search even after launch, when they serve the
production build too.

**Launching on kaltech.online.**

1. Fill every `[PLACEHOLDER]` (section 5), then run `npm run lastmod` and
   `npm run build:production` locally. The build names anything still unfilled.
2. In Vercel, set `SITE_ENV=production` on the Production environment, and the two
   verification variables if you have them.
3. Attach `kaltech.online` **and** `www.kaltech.online` to the project, both as domains that
   **serve the project**. Do not set `www` to "redirect to kaltech.online" in the dashboard:
   that redirect runs before `vercel.json` and turns `www` plus an old URL into two hops.
   `vercel.json` sends `www` to the apex itself, in one hop. Then move DNS from the old
   host (currently Google Frontend) to Vercel.
4. After the deploy, check it live: `ORIGIN=https://kaltech.online npm run verify:redirects`
   and `ORIGIN=https://www.kaltech.online npm run verify:redirects`. Check the one hop the
   local check cannot see: `curl -sI http://kaltech.online/about-us` must answer 308 to
   `https://kaltech.online/about-us`.
5. Submit `https://kaltech.online/sitemap.xml` in Search Console and Bing Webmaster Tools,
   and run the thirteen URLs through Google's Rich Results Test
   (`npm run verify:schema` prints the list).

Four things are Vercel-specific and will not travel:

**`vercel.json`.** Four jobs. `cleanUrls` serves `/work/kalpay` from `work/kalpay/index.html`.
The redirects implement the approved map in `docs/redirects.md`: every old URL in one 301,
`www` to the apex, and any trailing slash removed. A rewrite sends the old pitch-deck PDF to
`api/gone`, which answers 410. The headers are `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy`, the `Content-Security-Policy`, the preview's `X-Robots-Tag`, and
year-long immutable caching on `/_astro/`, where the CSS and fonts live.
Strict-Transport-Security is left to Vercel's default (two years, includeSubDomains,
preload); do not set it here, or it replaces that default. **The file does nothing anywhere
except Vercel.** On another host, reproduce all four in that host's own configuration. If the
redirects are skipped, every inbound link and search result pointing at an old URL lands on
a 404.

**The Content-Security-Policy carries the hash of the inline script.** `script-src` allows
`'self'` and one `sha256-` hash: the motion script inlined into every page. Change
`src/scripts/motion.js` and every build fails, printing the new hash; paste it into
`vercel.json` in place of the old one. That is deliberate: without it the policy would
silently block the script and every page would lose its motion. `style-src` allows
`'unsafe-inline'` for the 35 `style` attributes the pages use. The policy also blocks
Vercel's preview toolbar and comments script. To use Vercel Comments on a preview, allow
`https://vercel.live` as Vercel's documentation describes.

**`api/gone.js`.** Answers 410 Gone, noindexed, for old URLs with no successor.

**`api/contact.js`.** The contact form at `/contact` posts to `/api/contact`. That file is a
Vercel Serverless Function; it is not part of the Astro build and does not exist in `dist/`.
On any other host the form will POST to a URL that does not answer, and the visitor gets an
error page. Either deploy to Vercel, or provide an equivalent endpoint at the same path and
have it accept a urlencoded POST with `name`, `email`, `company` and `brief`. See the open
item in section 5 — the function as written does not deliver anything to anyone.

---

## 3. Adding a case study

One file. No other edit anywhere.

1. Copy an existing case: `cp src/content/work/becs.md src/content/work/<slug>.md`. The file
   name becomes the URL, so `northgate.md` is published at `/work/northgate`.
2. Replace the values in the frontmatter. It is frontmatter only — there is no body text
   below the `---`.
3. Set `order`. It controls the position on `/work`, in the homepage cases, and in the
   "More work" cards at the foot of the other case studies.
4. `cardCount` is the number the headline figure counts up to when it scrolls into view.
   Set it to `null` when the figure is not a plain number, as with `3→1`.
5. `imageGround` is `sand`, `slate` or `deep` and picks the ground of the image block. If it
   would clash with the section behind it, the site corrects it automatically.
6. Run `npm run build`. The schema in `src/content.config.ts` is strict: a missing or
   misshaped field fails the build with the field named, rather than shipping a broken page.

The new case then appears on `/work`, on the homepage and in every other case study's
"More work" cards with no further changes.

## 4. Adding an article

One file, frontmatter plus a markdown body.

1. `src/content/insights/<slug>.md`, published at `/insights/<slug>`.
2. `published: false` keeps a draft in the repository with no route built and no link to it
   anywhere. Set it to `true` to publish. Four entries currently sit at `false`.
3. `featured: true` puts the article at the top of `/insights` and on the homepage. Exactly
   one article should carry it.
4. `contents` is the sticky index down the side of the article. Each entry's `id` must match
   an `id` in the body, so body headings are written as HTML —
   `<h2 id="measured" data-body-block>What we measured</h2>` — rather than as markdown `##`.
5. `titleAccent` is the single word of the title that is set in red. Choose a word that
   carries meaning; never an adverb, and never a client's name.
6. `readingTime` and `order` are required. `seo` is optional and falls back to the title and
   standfirst.

---

## 5. Every `[PLACEHOLDER]` on the site

**The convention.** Where a real figure, fee, duration or date was not available, the site
carries the literal text `[PLACEHOLDER]`. Nothing was invented or estimated. These render
visibly on the page in a quieter style, so an unfilled value looks deliberate rather than
broken, and nothing about the layout depends on the real value's length.

**How to fill one in.** Open the file at the line given, replace the nine characters
`[PLACEHOLDER]` with the real value, keeping any surrounding quotation marks, then run
`npm run build`. `npm run placeholders` re-counts what is left and rewrites the table at the
foot of `README.md`. There are 57 in the source files, which render as 56 on the pages: a
few are shown on more than one page, and the seven client countries are not shown at all
until they are confirmed.

Since review round 1, a value that feeds a diagram lives in one data file under `src/data/`,
so each one is changed once however many places it appears.

Anything still unresolved can be left exactly as it is in a preview build: a page with a
placeholder in it reads correctly. **A production build will not ship one.** The launch gate
fails `npm run build:production` while any `[PLACEHOLDER]` renders on an indexable page, and
names each page and string. The 404 is never indexed, so it is not gated.

After filling anything in `src/content/`, run `npm run lastmod` too. Otherwise the sitemap
leaves out `<lastmod>` for that page (it never states a wrong date).

### Homepage and `/work`

| File and line | What it is | What kind of value it wants |
|---|---|---|
| `src/content/work/kalpay.md:7` | The KalPay card's "Constraint found" line, shown on the homepage, on `/work` (twice: the case index at the top, and the case row) and on the case study itself | One of the three diagnostic lenses: Process, Data, or Unit economics. See the open item in section 6 — this currently contradicts the testimonial |
| `src/data/footprint.json:24–30` | The seven client countries behind "7 countries". **These render nowhere** until they are confirmed — see "Every gate" below | A country's Natural Earth name, such as `United Arab Emirates`, with `"confirmed": true` |

### `/work/kalpay` — `src/content/work/kalpay.md`

| Line | What it is | What kind of value it wants |
|---|---|---|
| 27 | The "Constraint found" row of the snapshot panel | The same lens word as line 7 |
| 36 | The large figure in the "The constraint we found" section | The same lens word again |
| 74 | The headline outcome figure, labelled "Decisions returned without manual review" | A percentage |
| 77 | "Applications processed per agent" | A count, or a before-and-after such as `40→120` |
| 79 | "Time to decision, median" | A duration |
| 81 | "Audit findings on sequence compliance" | A count |
| 83 | "Figures drawn from client-side reporting over …" | The period the figures cover |

### `/work/ahw-global` — `src/content/work/ahw-global.md`

| Line | What it is | What kind of value it wants |
|---|---|---|
| 74 | The headline outcome figure, "Definitions of a shipment, consolidated" | A count or a before-and-after |
| 77 | "Reporting cycle" | A duration |
| 79 | "Tenants on platform" | A count |
| 81 | "Manual reconciliation removed" | A share, or the time it used to take |
| 83 | The footnote | The period the figures cover |

### `/work/becs` — `src/content/work/becs.md`

| Line | What it is | What kind of value it wants |
|---|---|---|
| 74 | The headline outcome figure, "Unit traceability, donor to patient" | A percentage |
| 77 | "Processing time per donation" | A duration |
| 79 | "Audit preparation time" | A duration |
| 81 | "Branches covered" | A count |
| 83 | The footnote | The period the figures cover |

### `/services`

| File and line | What it is | What kind of value it wants |
|---|---|---|
| `src/data/services.json:37` | "delivered in stages, typically [PLACEHOLDER]" | A typical delivery duration |
| `src/data/services.json:57` | "Reviewed at [PLACEHOLDER] intervals" | A review interval |
| `src/pages/services.astro:51` | The constraint on the KalPay proof row | The same lens word as `kalpay.md:7`, and it must match it |

### `/diagnostic`

| File and line | What it is | What kind of value it wants |
|---|---|---|
| `src/pages/diagnostic.astro:19` | "Duration" in the summary panel | How long a diagnostic takes |
| `src/pages/diagnostic.astro:20` | "Fee" in the summary panel | The fixed fee |
| `src/data/diagnostic.json:82` | "…hours across the people who perform the work" | The hours asked of the client's staff |
| `src/data/diagnostic.json:3` | The number of weeks. Renders twice: "What the [PLACEHOLDER] weeks actually consist of", and the end of the phase timeline beneath it | A number. When it lands, move the red accent off "weeks" and onto the figure — see `README.md`, "When real values land" |
| `src/data/diagnostic.json:91, 98, 105, 112` | The page number on each of the four contents lines of the finding facsimile | A page number per line |
| `src/data/diagnostic.json:4` | The finding's length. Renders twice: "[PLACEHOLDER] pages" at the foot of the facsimile, and "runs to roughly [PLACEHOLDER] pages" beside it | A page count |
| `src/pages/diagnostic.astro:290` | The fee, set as a large figure | The same fee as line 20 |
| `src/pages/diagnostic.astro:333` | The figure for "Of the last N diagnostics recommended less than the client asked for" | A count or a share |
| `src/pages/diagnostic.astro:334` | The N in that same label | How many recent diagnostics the figure is drawn from |
| `src/pages/diagnostic.astro:338` | "Recommended nothing be built" | A count or a share |
| `src/pages/diagnostic.astro:341` | "Figures cover [PLACEHOLDER]" | The period those two figures cover |
| `src/pages/diagnostic.astro:364` | "[PLACEHOLDER] came in asking for a scoring model…" | Who the worked example was — a client name, or a description such as "A consumer lender" |
| `src/pages/diagnostic.astro:369` | "The binding one was [PLACEHOLDER]" | Which lens was binding in that example |
| `src/pages/diagnostic.astro:385` | "Scope requested · [PLACEHOLDER]" | The size of the scope originally asked for |
| `src/pages/diagnostic.astro:389` | "Scope delivered · [PLACEHOLDER]" | The size of what was actually built |

### `/about`

| File and line | What it is | What kind of value it wants |
|---|---|---|
| `src/data/about.json:22` | "Figures verified against delivery records as at [PLACEHOLDER]", at the right-hand end of the "Not counted" row | The date the figures above it were last verified |

### The article — `src/content/insights/retrieval-versus-fine-tuning.md`

| Lines | What it is | What kind of value it wants |
|---|---|---|
| 66–69 | Eight cells of the comparison table, two per row: retrieval against fine-tuned, for attributable accuracy, cost per query at volume, time to reflect a change, and the volume at which cost clears | Whatever the measurements were. All eight are empty; filling only some is fine |

### `/privacy` and `/terms`

| File and line | What it is | What kind of value it wants |
|---|---|---|
| `src/pages/privacy.astro:19` | The entire privacy policy | The policy text, which wants legal review rather than drafting here |
| `src/pages/terms.astro:19` | The entire terms of use | The same |

### Every gate: what opens it, and what it needs from you

Some parts of the site are built, tested and switched off, because the information that
makes them true has not arrived. Each opens from its data file; no code changes. Every one
has been opened in a test build with sample data and checked (`npm run verify:gates`), so
switching it on is a data edit, not a design task.

| Gate | Opened by | What it needs from you | Until it opens |
|---|---|---|---|
| **Homepage Clients: the three figures and the client map** | `src/data/footprint.json` → `countries`. Opens once five entries (`mapMin`) have `"confirmed": true` and a real country name | The countries KalTech has delivered in — the site says seven — each as its Natural Earth name (`United Arab Emirates`, not `UAE`) with `"confirmed": true` | The Clients section shows its "Clients" eyebrow and the three testimonials only. No figures, no map, no strip, and no `[PLACEHOLDER]` on the page. The figures would otherwise repeat the hero's stat row one screen above |
| **Homepage client strip** | `src/data/footprint.json` → `clients`. Opens once six names (`stripMin`) have `"confirmed": true`, **and** the Clients gate above is open | Client names you have permission to show. KalPay, AHW Global and BECS are confirmed; three more are needed. Ideally logo artwork too (SVG, no background): names set as text fail contrast unless they are logos — see section 6 | Not drawn |
| **Working-hours strip on `/about`** | `src/data/locations.json` → `"showOverlap": true` | The delivery team's real working hours in Lahore, entered in the same file, and confirmation of the three market rows as they stand: US East, UK, and GCC at UTC+4, all in standard time | Not drawn. At the placeholder 09:00–17:00 it would show no overlap at all between Lahore and US East, which is why it waits |
| **The four unwritten articles** (from before round 1) | `src/content/insights/<slug>.md` → `published: true` | The article text. Each of the four holds a title only | No route is built and they are listed nowhere |

A country name that does not match `src/data/country-centroids.json` stops the build with
the name in the error, rather than dropping a marker silently. The thresholds themselves,
`mapMin` and `stripMin`, are in `footprint.json` too.

### When the figures are real

Once the outcome figures are filled in, remove the placeholder-specific styling so the
figures sit on the normal layout: the `.fig-pending` rules in `src/styles/components.css`,
the `pending` check in `src/components/Figure.astro`, and the block marked TEMPORARY in
`src/styles/pages.css`. All three are commented as temporary and reference each other.
Nothing else depends on them.

---

## 6. Open items, and what happens if they are not resolved

**The homepage logo strip.** Nine of the twelve names in the export — Meridian, Northcote,
Vantor, Helix & Co, Arlowe, Sabre Freight, Ostium, Caldera, Wren Systems — appear nowhere
else in any version of the site and were removed as unverified; an invented client name is a
false claim. The strip now renders only once six names are confirmed in
`src/data/footprint.json` and the Clients gate is open, so it is currently not drawn. *When it returns, so does the
contrast question:* the names are set as text at 60 percent opacity, 2.43:1 against paper
where 4.5:1 is required, which only holds as a logotype exemption if real logo images replace
the text. Otherwise set the names in `--muted` at full opacity.

**There is no SVG wordmark.** The KalTech wordmark in the header and footer is type-set in
Sora with a red period, and the three PNGs in `Brand/` cannot be used — all have baked-in
backgrounds. The favicon, the app icon and the social share card in `public/` are generated
from the same font file by `npm run favicon`. *If no SVG arrives, the site keeps working and
looks right, but the brand mark is a typographic approximation rather than artwork, the
`Organization` schema's `logo` stays the provisional 512px icon, and the icons cannot be
refined.* **The schema logo is provisional:** `src/data/organization.json` → `logo` points at
`/icon-512.png`. When the SVG wordmark arrives, export a PNG of it (Google does not accept an
SVG `logo`), put it in `public/`, and change `logo.path`, `width` and `height` there. What is needed:
outlined letterforms, no embedded font, no background, with the period as a separate shape
so it can be coloured on its own. `README.md` has the drop-in instructions.

**`/api/contact` does not deliver anything, and logs what visitors type.** It accepts the
POST, writes the submitted fields to the server log and returns success. *If it goes live as
written, every enquiry is lost — the visitor sees a success response and nobody at KalTech
ever receives the message — and visitors' names, email addresses and message text
accumulate in Vercel's function logs, which is a data-protection problem as well as a
commercial one.* Replace the log line in `handler` with real delivery (email, CRM or queue)
before the site takes traffic.

**No dates in the structured data.** `datePublished` and `dateModified` are absent from the
Article on the insights article and the three case studies, because the site states no
dates and none was invented. *If they stay absent, rich results show no date and
`npm run verify:schema` reports each as an expected warning.* Nothing breaks. When real
publication dates exist, add them to the content frontmatter and to `article()` in
`src/lib/schema.ts`.

**The KalPay constraint contradicts itself.** The homepage card and the case study say the
binding constraint was `[PLACEHOLDER]`; the testimonial on the same page says it was data.
Both were left exactly as supplied. *If this is not settled, an attentive reader — which is
to say a prospective client reading the flagship case study closely — finds the site
disagreeing with itself about the single most important finding in it.* Settle which it was,
then fill in `kalpay.md` lines 7, 27 and 36 and `services.astro` line 51 with the same word.
The KalPay meta description (`seo.description` in `kalpay.md`) deliberately names neither
lens; it can say which once the site does.

**The diagnostic's length is stated two ways.** Services says "Two to three weeks" twice
(the Consulting line and the first stage of How we engage); the Diagnostic page says "What
the [PLACEHOLDER] weeks actually consist of" and "Duration: [PLACEHOLDER]". Both were left as
supplied. *If the placeholder is filled with anything but two to three, the site contradicts
itself about its own entry product.* Fill `src/data/diagnostic.json` `weeks` and the Duration
panel with a value that agrees with Services, or change Services to match.

**The illustrative values in the diagrams are not measurements.** Every timeline's
proportions, the dot counts in the About org shape, and the two numbers in the Data lens
diagram (1,204 and 1,187 customers) are drawn to show a shape, and each is captioned
"Illustrative" or "Illustrative proportions". *If a caption is ever removed, the drawing
becomes a claim.* They live in `src/data/timelines.json` and `src/data/lenses.json`.

**The three outcome figures are unverified.** `92%` on KalPay, `3→1` on AHW Global and
`100%` on BECS appear on the homepage, on `/work`, on `/services` and on each case study.
They came with the copy and were carried through unchanged; nobody in the build checked them
against delivery records. *If they are wrong, they are wrong in the most prominent numbers
on the site, in front of the clients they describe.* Confirm each against the actual
reporting before launch, or replace them with `[PLACEHOLDER]` until they can be.

---

## 7. Decisions that are locked, and why

These look like ordinary choices and are not. Each was made for a reason that is not
obvious from the code.

**Two colour pairings have zero contrast headroom.** `--accent-dark` on `--deep` measures
exactly 4.50:1 and `--muted` on `--slate` measures 4.55:1, against a 4.5:1 requirement for
small text. The page carries a 3 percent grain overlay, which composites those to 4.30 and
4.37. The decision taken is that they pass, because WCAG is assessed on specified colours
and the grain is decorative noise, not a colour change. **The consequence: no further
overlay may be added anywhere on the site — no scrim, tint, wash or second texture — without
re-running `npm run verify:contrast` and reading the "w/ grain" column.** The grain budget
on those two pairings is 0.02 and 0.80 percent respectively. A second 3 percent layer spends
it twice and takes the site below AA.

**Red marks a primary among secondaries, never one peer among peers.** Where a group has a
lead item and supporting ones, the accent goes on the lead alone. Where the items are peers
— the three homepage statistics, the three outcome figures — the treatment is uniform: all
of them accent, or none. One of three peers in red reads as a bug, not as a hierarchy.

**Structural red does not count toward the five-per-screen cap.** Label rules, device rules,
accent borders, drop lines, phase rails and the binding node in the constraint gates are
structure. The cap of five counts emphasis only: accent words, figures, buttons and inline
arrows. `npm run verify:red` implements exactly this distinction; if the counting rule is
changed, that script has to change with it or it starts failing correct pages.

**`motion.js` is a classic script, not a module.** It is inlined into every page's `<head>`
as a plain `<script>`. A module would not execute over `file://`, which would break the
review build that the site is reviewed with. It also means the file cannot use `import` or
`export`.

**Route transitions use native CSS `@view-transition`, not Astro's `ClientRouter`.**
`ClientRouter` ships a JavaScript module to every page to do the same job. The native rule is
a few lines of CSS, ships nothing, and degrades to an ordinary navigation in browsers that do
not support it. This is the reason the site has no client-side router.

**Body text is left-aligned.** Justification was tested on every qualifying paragraph, and 23
of 45 exceeded a 2x word gap in at least one browser engine and width, so the site is
left-aligned by decision. Anyone reconsidering must re-run the check first
(`npm run verify:justify`, with `candidates` to test paragraphs without editing them).

**One URL per page.** The canonical, `og:url`, the JSON-LD `url`, the sitemap `<loc>`, every
internal link and the address that answers 200 are the same string: `https://kaltech.online`,
no `www`, no trailing slash (the root is `https://kaltech.online/`). Astro builds with
`trailingSlash: 'never'` and the directory format; `vercel.json` 301s a trailing slash away.
`npm run verify:seo` checks all six for every route.

**Titles end " | KalTech", and they are exact.** Each title leads with the page's subject
and stays within 60 characters. Each description runs 150 to 160 characters, is unique,
and is built from the page's own words. The approved set is in the page files and in the
`seo` block of each content file; `npm run verify:seo` enforces the rules.

**Schema says only what the page shows.** The insights article's author is a Person, Kaleem
Ahmad, working for KalTech, matching its byline. The case studies have no byline, so their
author is the Organization. There are no FAQPage, Review, AggregateRating, LocalBusiness or
ProfessionalService nodes, and none should be added: the site has no FAQ, reviews, ratings or
premises to back them.

**`.fig-pending` exists only while figures are placeholders.** `[PLACEHOLDER]` set at figure
size is far wider than a number, so that class drops it to a readable size and a block of
`:has(.fig-pending)` rules stacks the surrounding grids. It is scaffolding, not design: when
the real figures land, remove it — the three places are listed at the end of section 5. Left
in, it will quietly shrink real figures that were meant to be large.

---

## 8. Where everything lives

```
src/pages/          one file per route, and 404.astro
src/layouts/        Base.astro — the head, the robots and social meta, the header and footer
src/lib/schema.ts   the JSON-LD @graph for every page
src/integrations/   seo.mjs — robots.txt, sitemap.xml, llms.txt, the launch gate, the CSP check
src/components/     shared pieces: SectionHead, Figure, Panel, Cta, ImageSlot …
src/content/        the case studies and the articles, as markdown
src/data/           every value a diagram draws from: figures, labels, countries,
                    proportions, and the switches for the gated elements;
                    organization.json (the schema's Organization, the LinkedIn URL)
                    and lastmod.json (the sitemap's dates)
src/styles/         tokens.css (the only file allowed a colour literal), then
                    base, layout, components, motion, pages
src/scripts/        motion.js, the single inlined script
public/             favicon.ico, app icons, share card
api/                the Vercel functions: contact (the form), gone (410)
docs/redirects.md   the approved redirect map, which verify:redirects reads
scripts/            the verification tooling — see README.md
verification/       screenshots and reports written by those scripts
```
