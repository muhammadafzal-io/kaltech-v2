# Redirect map: old kaltech.online to the new site

Status: **approved 2026-09-24**, with `/products` sent to `/work`. `vercel.json` implements
this table, and `npm run verify:redirects` reads the table below and checks every row on
the apex, `www` and preview hosts. That keeps the file and the rules from drifting apart:
change a row here, and the check expects the new behaviour.

## Canonical policy

| Part | Rule |
|---|---|
| Scheme | `https` only. |
| Host | `kaltech.online` (apex). `www.kaltech.online` is never canonical. |
| Path | As authored, lowercase, no trailing slash, no `.html`, no `index.html`, no query string. |
| Root | `https://kaltech.online/`. A root URL always has the path `/`, so `https://kaltech.online` and `https://kaltech.online/` are the same URL. The root is the only canonical that ends in a slash. |
| Same string everywhere | Canonical, `og:url`, sitemap `<loc>`, JSON-LD `url`/`@id`, internal `href`, and the URL the server answers on (200, no redirect) are the same string for every page. |
| Preview host | Pages on `kaltech-site.vercel.app` keep canonicals pointing at `https://kaltech.online` and are noindexed. |
| Astro | `trailingSlash: 'never'` and `build.format: 'directory'` (both unchanged). `dist/work/index.html` is served at `/work`. |
| Vercel | `cleanUrls: true` stays. `trailingSlash: false` is removed and replaced by explicit 301 rules, because Vercel applies its built-in slash rule before user redirects. That created two-hop chains on the preview before this change: `/about-us/` → 308 `/about-us` → 308 `/about`. Vercel serves a directory's `index.html` at the path without the slash (the rule in Vercel's own `shouldServe`), so `/work` answers 200 from `work/index.html`. The local check confirms it; confirm it live after the first deploy with `ORIGIN=https://kaltech-site.vercel.app npm run verify:redirects`. If it ever fails, the fallback is `build.format: 'file'` (`dist/work.html`, served at `/work` by `cleanUrls`). |

## The map

Every row is one hop. A destination on the same host keeps that host (so the preview
redirects within the preview). A request on `www.kaltech.online` goes straight to the apex
destination, so `www` plus an old path is still one hop.

| Old URL | Status | New URL | Reason |
|---|---|---|---|
| `https://kaltech.online/` | 200 | `https://kaltech.online/` | Same URL; new homepage. |
| `/about-us` | 301 | `/about` | Same page, renamed. |
| `/about-us/` | 301 | `/about` | Slash variant of the row above. The old site 308s it; one hop direct. |
| `/contact-us` | 301 | `/contact` | Same page, renamed. |
| `/contact-us/` | 301 | `/contact` | Slash variant. |
| `/ai-solutions` | 301 | `/services` | Old H1 "AI Development & Integration Services". The new site has no per-service page; the Services page carries all three lines. |
| `/ai-solutions/` | 301 | `/services` | Slash variant. |
| `/custom-development` | 301 | `/services` | Old H1 "Custom Development Solutions". The Development line lives on the Services page. |
| `/custom-development/` | 301 | `/services` | Slash variant. |
| `/loan-management-system` | 301 | `/work/kalpay` | Old H1 "AI-Powered Lending Platform That Scales With You". KalPay is that lending platform. |
| `/loan-management-system/` | 301 | `/work/kalpay` | Slash variant. |
| `/products` | 301 | `/work` | Unlinked, but live (200). The old page listed two products, the lending platform and BECS, so the work index is the honest destination. |
| `/products/` | 301 | `/work` | Slash variant. |
| `/becs` | 301 | `/work/becs` | Old H1 "Smart Blood Bank Management System". The BECS case study. |
| `/becs/` | 301 | `/work/becs` | Slash variant. |
| `/terms` | 200 | `/terms` | Was 404 (noindex) on the old site but linked from its footer. The new page exists at the same path. |
| `/terms/` | 301 | `/terms` | Slash variant. |
| `/privacy` | 200 | `/privacy` | As `/terms`. |
| `/privacy/` | 301 | `/privacy` | Slash variant. |
| `/KalTech%20Pitch%20Deck.pdf` | 410 | none | Linked PDF (9,436,670 bytes). No successor on the new site; 410 approved. |
| `/favicon.ico` | 200 | `/favicon.ico` | Old site serves it. The new site ships `public/favicon.ico`, the 32px icon in an ICO wrapper (`scripts/make-ico.mjs`). No redirect. |
| `/robots.txt` | 200 | `/robots.txt` | Was 404. Production allows crawling; preview disallows all. |
| `/sitemap.xml` | 200 | `/sitemap.xml` | Was 404. Production only; 404 on preview. |
| `https://www.kaltech.online/` | 301 | `https://kaltech.online/` | Old site serves `www` as a duplicate (200, no redirect). |
| `https://www.kaltech.online/{old path}` | 301 | `https://kaltech.online/{new path from this table}` | One hop. For example, `www…/about-us` → `https://kaltech.online/about`. |
| `https://www.kaltech.online/{new path}` | 301 | `https://kaltech.online/{same path}` | Host normalisation. |
| `http://kaltech.online/*`, `http://www.kaltech.online/*` | 308 | `https://` + same host and path | Vercel's automatic HTTPS upgrade, applied at the edge before any rule. **Accepted as unavoidable (2026-09-24).** It cannot be set to 301 or merged into the rules above, so `http://` plus an old path is two hops: 308 to https, then the 301 above. The old site used 302 here. Vercel's default HSTS (two years, includeSubDomains, preload) stops browsers repeating the http request after the first visit. |
| `https://www.kaltech.online/KalTech%20Pitch%20Deck.pdf` | 301, then 410 | `https://kaltech.online/KalTech%20Pitch%20Deck.pdf` | The one `www` case that is two responses. Every redirect runs before any rewrite on Vercel, so the host rule answers first; the apex then answers 410. The old site never linked the `www` form. |
| `/{new path}/` (e.g. `/work/`) | 301 | `/{new path}` | Replaces Vercel's built-in 308 slash rule. |
| `/index.html`, `/{new path}/index.html`, `/{new path}.html` | 308 | `/`, `/{new path}` | Vercel `cleanUrls`. Never linked; the old site returned 404 for `/index.html`. |

## How the rules are ordered

Vercel runs every redirect, in array order, before it looks at the filesystem, and runs
rewrites only after that. So `vercel.json` has, in order:

1. For host `www.kaltech.online` only: each old URL in both slash forms, 301 to its
   absolute apex destination. Then `/` to `https://kaltech.online/`. Then any path with a
   trailing slash to the apex path without it. Then any other path to the same apex path.
   Every `www` request is therefore one hop, even with an old path or a trailing slash.
2. For every other host (the apex, and the preview): each old URL in both slash forms, 301
   to a relative destination. The preview therefore redirects within the preview.
3. Any path with a trailing slash, 301 to the same path without it. This replaces Vercel's
   `trailingSlash: false`, which ran before the rules and caused two-hop chains.
4. After the filesystem: the PDF, in its encoded and decoded spellings, rewritten to
   `api/gone`, a function that answers 410 with `X-Robots-Tag: noindex`. A Vercel redirect
   cannot answer 410.

Only literal host conditions are used for `www`, and the `/:path` patterns are the
documented ones. The local check compiles `vercel.json` with Vercel's own
`@vercel/routing-utils` rather than a reimplementation.

`www.kaltech.online` must be attached to the Vercel project as a domain that **serves the
project**, not as a dashboard "redirect to kaltech.online". A dashboard redirect runs
before `vercel.json` and turns `www` plus an old path into a two-hop chain.

## Old-site inventory

Crawled 2026-09-24. The crawl ran breadth-first from the homepage and followed every
same-host link. It also probed 40 common paths and every host and slash variant, and
recorded each redirect hop by hop. The old site has no robots.txt and no sitemap. Every
page has the same title ("KalTech") and the same description.

| URL | Status | Location | Notes |
|---|---|---|---|
| `https://kaltech.online/` | 200 | | H1 "We build fast, scalable AI solutions for small businesses" |
| `/about-us` | 200 | | |
| `/contact-us` | 200 | | |
| `/ai-solutions` | 200 | | |
| `/custom-development` | 200 | | |
| `/loan-management-system` | 200 | | |
| `/becs` | 200 | | |
| `/products` | 200 | | Not linked; duplicate of `/loan-management-system` |
| `/terms` | 404 | | noindex; linked from footer |
| `/privacy` | 404 | | noindex; linked from footer |
| `/KalTech%20Pitch%20Deck.pdf` | 200 | | application/pdf, 9,436,670 bytes; linked |
| `/favicon.ico` | 200 | | |
| `/robots.txt` | 404 | | |
| `/sitemap.xml` | 404 | | |
| `/index.html` | 404 | | |
| `/{each page}/` (9 paths) | 308 | unslashed path | |
| `http://kaltech.online/` | 302 | `https://kaltech.online/` | |
| `http://kaltech.online/about-us` | 302 | `https://kaltech.online/about-us` | |
| `https://www.kaltech.online/` | 200 | | Duplicate host, no redirect |
| `https://www.kaltech.online/about-us` | 200 | | Duplicate host, no redirect |
| `http://www.kaltech.online/` | 302 | `https://www.kaltech.online/` | |
| 40 probed paths (`/about`, `/contact`, `/services`, `/work`, `/blog`, `/insights`, `/careers`, `/pricing`, `/privacy-policy`, `/wp-admin` and others) | 404 | | None exist |

External links on the old site, recorded for reference and not redirected: Calendly
(`calendly.com/shershah-kaltech/30min`), Facebook (`facebook.com/KalTechai`), Instagram
(`instagram.com/kaltech.ai`) and LinkedIn (`linkedin.com/company/kal-tech`).

## Checking it

| Command | What it checks |
|---|---|
| `npm run verify:redirects` | Every row above on the apex, `www` and preview hosts, plus every current route and its slash form. Runs against `dist/` through a local stand-in for Vercel's edge (`scripts/vercel-emulator.mjs`), which compiles `vercel.json` with Vercel's own routing package. |
| `ORIGIN=https://kaltech-site.vercel.app npm run verify:redirects` | The same rows against a live deployment, on that deployment's host. Run it after every deploy that touches `vercel.json`, and on `https://kaltech.online` and `https://www.kaltech.online` once the domains are attached. |

The local check cannot show the http → https 308, which Vercel applies before any rule.
Check that one live.
