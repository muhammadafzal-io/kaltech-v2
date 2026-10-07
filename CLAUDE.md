# KalTech website

Marketing site for KalTech, a senior-led applied AI and software firm for mid-market
companies. Twelve pages. Static. Premium. Read this file before touching anything.

## What you are working from

`/source/` holds twelve `.dc.html` files plus `support.js` and `responsive.css`. These are
an export from Claude Design and are NOT a website. They use `<x-dc>`, `<dc-import>`,
`{{ }}` props, `style-hover` attributes and a `DCLogic` runtime. None of it runs outside
that tool. Treat them as the content and layout source of truth, never as code to ship.

`/source/kaltech-services.html` is a standalone file carrying the NEW Services copy. The
`services.dc.html` export is stale. Use the standalone file for content.

`/brand/` holds three logo PNGs. All have baked backgrounds. Do not place them on the page.
The header wordmark is type-set in Sora with a red period, matching the third variant.

## Stack

Astro, static output, no UI framework, no Tailwind, no component library. Plain CSS with
custom properties. Self-hosted fonts via `@fontsource/sora` and
`@fontsource/instrument-sans`. Zero client-side dependencies. Motion is CSS plus a single
small IntersectionObserver module. Deploys to Vercel as static.

Tailwind is banned because it produces templated output and fights the token system.

## Design tokens, locked

Colour
--paper #FAF9F5 · --sand #EFEAE0 · --slate #E4E8E7 · --deep #1F292B
--ink #171F21 · --body #4A5457 · --muted #61696A
--accent #BE263B · --accent-pressed #93182B · --accent-dark #E8616A
--rule #D8D5CD · --rule-sand #DBD4C6 · --rule-dark rgba(250,249,245,0.14)
--body-dark #A8B4B6 · --muted-dark #9AA5A7
--rule-slate #D2D6D5
--on-accent #FFFFFF · --on-accent-dim rgba(255,255,255,0.88) · --rule-on-accent rgba(255,255,255,0.3)
--deep-step #263133
--grid-on-accent rgba(255,255,255,0.05) · --grid-on-deep rgba(250,249,245,0.045)
--scrim-deep rgba(15,20,22,0.72) · --scrim-none rgba(15,20,22,0)

Rules: --accent on light grounds only. --accent-dark on --deep only. Never both in one
section. No shadows anywhere. Border radius 0 on every element. Depth comes from ground
changes and 1px hairlines.

Where the additions apply: --rule-slate is the hairline on --slate grounds. The on-accent
set is text, rules and the inverted button on the --accent band only. --deep-step is the
hover ground on --deep. --grid-on-accent and --grid-on-deep are the hairline grid overlays
on the accent and deep bands. The scrim pair is the gradient over the featured insight.

Red audit: structural red is not counted — label rules, device rules, accent borders, drop
lines, phase rails, and the binding node in either constraint gate. The count measures
emphasis: accent words, figures, buttons and inline arrows. No more than five of those in
any one viewport height of scroll, with the fixed header excluded as persistent chrome. A
group with a primary and secondaries takes the accent on the primary only; a group of peers
takes uniform treatment, all accent or none, never one of three.

Contrast: --muted is the lightest text permitted on light grounds (4.55:1 on slate).
--accent-dark is the only red permitted on --deep (4.5:1). Do not introduce new greys.

Type
Headings, numerals, figures: Sora 600 and 700.
Body, labels, UI: Instrument Sans 400 and 500.
No serif. No monospace. No Inter.

Scale, all clamp:
--fs-h1: clamp(34px, 5.6vw, 76px) / 1.04 / -3px
--fs-h1-inner: clamp(32px, 4.8vw, 60px) / 1.06 / -2.4px
--fs-h2: clamp(26px, 3.2vw, 44px) / 1.12 / -1.8px
--fs-h2-side: clamp(24px, 2.6vw, 34px) / 1.15 / -1.2px
--fs-h3: clamp(19px, 1.7vw, 23px) / 1.3 / -0.6px
--fs-figure: clamp(44px, 6vw, 84px) / 1 / -3.5px, tabular-nums
--fs-figure-md: clamp(40px, 4.5vw, 64px) / 1 / -2.4px, tabular-nums. Secondary figures in narrow
  columns, against --fs-figure for primary figures in full-width bands.
--fs-numeral: clamp(28px, 3vw, 40px) / 1 / -1.5px
--fs-standfirst: clamp(18px, 1.6vw, 22px) / 1.5
--fs-body: clamp(16px, 1.2vw, 17px) / 1.65
--fs-label: 12px / 500 / 1.2px tracking / uppercase, fixed at every width

Layout
Content column 1320px inside a 1464px wrapper. Gutters clamp(20px, 5vw, 72px). 12 columns,
28px gaps. Section padding clamp(56px, 7vw, 96px). Full-bleed --deep and --accent bands
clamp(64px, 8vw, 120px). Hero top clamp(72px, 8vw, 120px) plus header height.

Breakpoints: 1024, 768, 520. No others. Fluid between them.

Header height is `--header-h`: 88px desktop, 64px at 1024 and below. Every sticky offset
is `calc(var(--header-h) + 32px)`. Never a hardcoded pixel offset.

## Standing rules

1. Nothing is hidden by default and revealed by JavaScript. Every page renders complete
   with JavaScript disabled. Motion is enhancement only. Test this.
2. No `{{ }}`, no template props, no `style-hover`. Real CSS classes, real `:hover`.
3. Hover styling never present in a default state.
4. Any sticky element inside a grid has `align-self: start`, and no ancestor carries
   `overflow: hidden` or `overflow: clip`.
5. Every two-column section shares a bottom edge on desktop, and that rule is removed at
   the breakpoint where the columns stack.
   Exception: the closing band. Its qualifier sits directly beneath the heading, so the two
   columns do not share a bottom edge. This is deliberate.
6. No `min-width` on any element. No horizontal scroll at 320px. The one exception is the
   article data table, which scrolls inside its own wrapper.
7. Form inputs are 16px minimum on mobile. Tap targets 44px minimum.
8. `prefers-reduced-motion` disables all motion and leaves every element visible.

## Content rules

Do not rewrite, shorten, expand or reorder copy. The words are final.

Every `[PLACEHOLDER]` stays as the literal string `[PLACEHOLDER]`. Do not invent figures,
fees, durations, page counts or dates. Do not resolve any of the following, which are
open decisions for the client:

- KalPay constraint: the homepage card says [PLACEHOLDER], the testimonial says data. Leave
  both exactly as they are.
- The outcome figures 92%, 3→1 and 100% where they appear. Leave them.
- Any `[PLACEHOLDER]` on the Diagnostic, Services, case study and About pages.

The only copy changes permitted are the three listed in the kickoff brief.

## Routes

/ · /work · /work/kalpay · /work/ahw-global · /work/becs · /services · /diagnostic
/insights · /insights/retrieval-versus-fine-tuning · /about · /contact

Header nav: Work, Services, Diagnostic, Insights, About, then the CTA to /contact.

Cta on every page except Contact and article pages.

## What good looks like

Expensive, calm, certain. A firm, not a product. The reference points are bcg.com/x and
kearney.com for register, linear.app for motion discipline. Restraint carries the premium
read; the liveliness comes from a small number of things done with precision, not from
decoration. If a choice is between safe and striking, choose striking, but never at the
cost of looking cheap.
