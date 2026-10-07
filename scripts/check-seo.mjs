// Technical SEO, checked per route from the built site.
//
//   node scripts/check-seo.mjs             dist/
//   DIST=path node scripts/check-seo.mjs   another build
//
// The build's mode is read from its pages: a preview build carries
// noindex,nofollow everywhere and has no sitemap; a production build is
// indexable and has one.
//
//   1. One URL per page. The canonical, og:url, the JSON-LD WebPage url, the
//      sitemap <loc> (production), every internal link to the page, and the
//      URL that answers 200 through the Vercel emulator are the same string.
//      No internal link points at a redirect.
//   2. Titles and descriptions: title at most 60 characters, ending " | KalTech",
//      no em dash; description 150-160 on indexable pages; both unique.
//   3. Headings: exactly one h1, no skipped level, none inside an SVG. The
//      outline of every route is printed.
//   4. Crawl: lang="en" everywhere, no hreflang, every page within three clicks
//      of the homepage, no orphans. robots.txt, sitemap.xml and llms.txt as the
//      mode requires. Open Graph and Twitter complete; og:type article on the
//      case studies and the article; og:image 1200x630 and in the build.
//   5. In Chromium, WebKit and Firefox, through the emulator (so the real
//      Content-Security-Policy applies): no CSP violation, and the inline
//      motion script ran. In Chromium at 1440 and 375: every SVG is an image
//      with a name (its <title>) and a description (its <desc>); interface
//      sketches are named "Illustrative interface"; every <img> has alt text;
//      every "Read the case study" link has an accessible name unique on its
//      page that includes the client; the 404 has no horizontal scroll at 320.
import { chromium, webkit, firefox } from 'playwright';
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveVercel, get } from './vercel-emulator.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = process.env.DIST ?? join(ROOT, 'dist');
const SITE = 'https://kaltech.online';
const APEX = 'kaltech.online';
const ARTICLES = ['/work/kalpay', '/work/ahw-global', '/work/becs', '/insights/retrieval-versus-fine-tuning'];
const CLIENTS = { '/work/kalpay': 'KalPay', '/work/ahw-global': 'AHW Global', '/work/becs': 'BECS' };

const fileOf = (route) => join(DIST, route === '/' ? 'index.html' : route === '/404' ? '404.html' : route.slice(1) + '/index.html');
const exists = (p) => access(p).then(() => true, () => false);
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
const metaOf = (html, key, value) => {
  const tag = html.match(new RegExp(`<meta[^>]*${key}="${value}"[^>]*>`))?.[0];
  return tag ? decode(tag.match(/content="([^"]*)"/)?.[1] ?? '') : null;
};
const expectedUrl = (route) => (route === '/' ? `${SITE}/` : SITE + route);

// The accessible name from the first line of a Playwright aria snapshot. A
// name containing ": " comes back YAML-quoted: - 'img "A: B"'.
function snapName(snap, role) {
  let line = (snap.split('\n')[0] ?? '').trim().replace(/^- /, '');
  if (line.startsWith("'")) line = line.slice(1, line.lastIndexOf("'")).replace(/''/g, "'");
  const m = line.match(new RegExp(`^${role} "((?:[^"\\\\]|\\\\.)*)"`));
  return m ? m[1].replace(/\\"/g, '"') : null;
}

const problems = [];
const pages = new Map();
for (const route of [...ROUTES, '/404']) {
  const html = await readFile(fileOf(route), 'utf8');
  const ld = JSON.parse(html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/)?.[1] ?? '{}');
  pages.set(route, {
    html,
    title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
    description: metaOf(html, 'name', 'description') ?? '',
    robots: metaOf(html, 'name', 'robots'),
    canonical: html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? null,
    ogUrl: metaOf(html, 'property', 'og:url'),
    ogType: metaOf(html, 'property', 'og:type'),
    ogImage: metaOf(html, 'property', 'og:image'),
    ldUrl: (ld['@graph'] ?? []).find((n) => n['@type'] === 'WebPage')?.url ?? null,
    lang: html.match(/<html[^>]*lang="([^"]*)"/)?.[1] ?? null,
    hreflang: /hreflang=/.test(html),
    twitter: ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].map((k) => metaOf(html, 'name', k)),
    og: ['og:title', 'og:description', 'og:type', 'og:image', 'og:site_name'].map((k) => metaOf(html, 'property', k)),
    links: [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => decode(m[1])),
  });
}

const home = pages.get('/');
const production = home.robots === null;
const mode = production ? 'production' : 'preview';
const distFiles = await readdir(DIST);
const sitemap = distFiles.includes('sitemap.xml') ? await readFile(join(DIST, 'sitemap.xml'), 'utf8') : null;
const locs = sitemap ? [...sitemap.matchAll(/<url><loc>([^<]+)<\/loc>(?:<lastmod>([^<]+)<\/lastmod>)?<\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] ?? null })) : [];
const robotsTxt = distFiles.includes('robots.txt') ? await readFile(join(DIST, 'robots.txt'), 'utf8') : null;
const llms = distFiles.includes('llms.txt') ? await readFile(join(DIST, 'llms.txt'), 'utf8') : null;

// 1. One URL per page.
const server = await serveVercel(DIST, 4720);
const urlRows = [];
for (const route of ROUTES) {
  const p = pages.get(route);
  const want = expectedUrl(route);
  const served = await get(server.port, APEX, route);
  const sm = locs.find((l) => l.loc === want);
  const row = {
    route,
    canonical: p.canonical === want,
    ogUrl: p.ogUrl === want,
    ld: p.ldUrl === want,
    sitemap: production ? !!sm : null,
    lastmod: sm?.lastmod ?? null,
    served: served.status === 200 && !served.headers.location,
  };
  urlRows.push(row);
  for (const [k, v] of Object.entries(row)) if (v === false) problems.push(`${route}: ${k} is not ${want}`);
}
if (production && locs.length !== ROUTES.length) problems.push(`sitemap has ${locs.length} URLs; ${ROUTES.length} indexable routes`);
if (production && locs.some((l) => l.loc.endsWith('/') && l.loc !== `${SITE}/`)) problems.push('sitemap has a trailing-slash URL');
if (production && sitemap.includes('/404')) problems.push('sitemap lists the 404');

// Every internal link: an exact route string (or a file), answering 200 with no redirect.
const internal = new Map();
for (const [route, p] of pages) {
  for (const href of p.links) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const path = href.split('#')[0];
    if (!path) continue;
    if (!internal.has(path)) internal.set(path, new Set());
    internal.get(path).add(route);
  }
}
const linkRows = [];
for (const [path, from] of internal) {
  const res = await get(server.port, APEX, path);
  const isRoute = ROUTES.includes(path);
  const ok = res.status === 200 && !res.headers.location && (isRoute || /\.[a-z0-9]+$/.test(path));
  linkRows.push({ path, status: res.status, from: from.size, ok });
  if (!ok) problems.push(`internal link ${path} (on ${[...from].join(', ')}) answers ${res.status}${res.headers.location ? ` → ${res.headers.location}` : ''}`);
}

// 2. Titles and descriptions.
const titleRows = [];
const allTitles = ROUTES.map((r) => pages.get(r).title);
const allDescs = ROUTES.map((r) => pages.get(r).description);
for (const route of ROUTES) {
  const { title, description } = pages.get(route);
  const flags = [];
  if (title.length > 60) flags.push('title > 60');
  if (!title.endsWith(' | KalTech') || title.split(' | ').length !== 2) flags.push('title separator');
  if (/[—:]/.test(title)) flags.push('title has an em dash or colon');
  if (description.length < 150 || description.length > 160) flags.push(`description ${description.length}`);
  if (allTitles.filter((t) => t === title).length > 1) flags.push('duplicate title');
  if (allDescs.filter((d) => d === description).length > 1) flags.push('duplicate description');
  titleRows.push({ route, title, tl: title.length, dl: description.length, flags });
  for (const f of flags) problems.push(`${route}: ${f}`);
}

// 3. Headings.
const outlines = new Map();
for (const [route, p] of pages) {
  const body = p.html.replace(/<(script|style)[\s\S]*?<\/\1>/g, '');
  const inSvg = [...body.matchAll(/<svg[\s\S]*?<\/svg>/g)].some((m) => /<h[1-6][\s>]/.test(m[0]));
  const hs = [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => ({
    level: +m[1],
    text: decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim(),
  }));
  const skips = [];
  hs.forEach((h, i) => {
    if (i > 0 && h.level > hs[i - 1].level + 1) skips.push(`h${hs[i - 1].level} → h${h.level} at "${h.text.slice(0, 40)}"`);
  });
  const h1 = hs.filter((h) => h.level === 1).length;
  if (h1 !== 1) problems.push(`${route}: ${h1} h1`);
  if (hs[0]?.level !== 1) problems.push(`${route}: first heading is h${hs[0]?.level}`);
  for (const s of skips) problems.push(`${route}: skipped level ${s}`);
  if (inSvg) problems.push(`${route}: heading inside an SVG`);
  outlines.set(route, { hs, h1, skips, inSvg });
}

// 4. Crawl, mode files, social.
const depth = new Map([['/', 0]]);
const queue = ['/'];
while (queue.length) {
  const r = queue.shift();
  for (const href of pages.get(r)?.links ?? []) {
    const path = href.split('#')[0];
    if (ROUTES.includes(path) && !depth.has(path)) {
      depth.set(path, depth.get(r) + 1);
      queue.push(path);
    }
  }
}
for (const route of ROUTES) {
  const d = depth.get(route);
  if (d === undefined) problems.push(`${route}: orphan, not reachable from /`);
  else if (d > 3) problems.push(`${route}: ${d} clicks from /`);
}
const ogImage = join(DIST, 'og-card.png');
const png = (await exists(ogImage)) ? await readFile(ogImage) : null;
const ogDims = png ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : 'missing';
if (ogDims !== '1200x630') problems.push(`og-card.png is ${ogDims}`);
for (const [route, p] of pages) {
  if (p.lang !== 'en') problems.push(`${route}: lang="${p.lang}"`);
  if (p.hreflang) problems.push(`${route}: hreflang present`);
  if (p.twitter.some((v) => !v) || p.twitter[0] !== 'summary_large_image') problems.push(`${route}: Twitter set incomplete`);
  if (p.og.some((v) => !v)) problems.push(`${route}: Open Graph set incomplete`);
  if (p.ogImage !== `${SITE}/og-card.png`) problems.push(`${route}: og:image ${p.ogImage}`);
  const wantType = ARTICLES.includes(route) ? 'article' : 'website';
  if (p.ogType !== wantType) problems.push(`${route}: og:type ${p.ogType}, expected ${wantType}`);
  const wantRobots = route === '/404' ? (production ? 'noindex' : 'noindex,nofollow') : production ? null : 'noindex,nofollow';
  if (p.robots !== wantRobots) problems.push(`${route}: robots meta "${p.robots}", expected "${wantRobots}"`);
}
if (pages.get('/404').canonical) problems.push('/404 has a canonical');
const nf = await get(server.port, APEX, '/no-such-page');
if (nf.status !== 404) problems.push(`unknown URL answers ${nf.status}`);

const modeChecks = [];
if (production) {
  modeChecks.push(['robots.txt allows all', /User-agent: \*\nAllow: \//.test(robotsTxt ?? '')]);
  for (const ua of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) modeChecks.push([`robots.txt allows ${ua}`, new RegExp(`User-agent: ${ua}\\nAllow: /`).test(robotsTxt ?? '')]);
  modeChecks.push(['robots.txt: Sitemap: https://kaltech.online/sitemap.xml', /\nSitemap: https:\/\/kaltech\.online\/sitemap\.xml\n/.test(robotsTxt ?? '')]);
  modeChecks.push([`sitemap.xml: ${locs.length} URLs, absolute, no trailing slash`, locs.length === ROUTES.length]);
  modeChecks.push(['llms.txt lists every indexable page, with its title and description', !!llms && ROUTES.every((r) => llms.includes(`](${expectedUrl(r)}): ${pages.get(r).description}`))]);
  modeChecks.push(['llms.txt carries the LinkedIn company page', !!llms && llms.includes('https://www.linkedin.com/company/kal-tech')]);
} else {
  modeChecks.push(['robots.txt disallows all', /User-agent: \*\nDisallow: \/\n/.test(robotsTxt ?? '')]);
  modeChecks.push(['no sitemap.xml', !sitemap]);
  modeChecks.push(['no llms.txt', !llms]);
  modeChecks.push(['noindex,nofollow on all 14 pages', [...pages.values()].every((p) => p.robots === 'noindex,nofollow')]);
}
for (const [label, ok] of modeChecks) if (!ok) problems.push(label);

// 5. In the browsers.
const cspRows = [];
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]]) {
  const browser = await engine.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  let violations = 0;
  let ran = 0;
  for (const route of [...ROUTES, '/404']) {
    await page.goto(`${server.origin}${route === '/404' ? '/no-such-page' : route}`, { waitUntil: 'load' });
    const r = await page.evaluate(() => ({ v: window.__csp, js: document.documentElement.classList.contains('m-js') }));
    violations += r.v.length;
    if (r.js) ran++;
    for (const v of r.v) problems.push(`${name} ${route}: CSP violation ${v}`);
  }
  cspRows.push({ name, violations, ran });
  if (ran !== ROUTES.length + 1) problems.push(`${name}: motion script ran on ${ran} of ${ROUTES.length + 1} pages`);
  await browser.close();
}

const browser = await chromium.launch();
const svgRows = new Map();
const linkNameRows = [];
let imgs = 0;
let imgsOk = 0;
let sketches = 0;
let sketchesOk = 0;
for (const width of [1440, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  for (const route of ROUTES) {
    await page.goto(server.origin + route, { waitUntil: 'load' });
    const svgs = page.locator('main svg');
    const n = await svgs.count();
    for (let i = 0; i < n; i++) {
      const s = svgs.nth(i);
      const dom = await s.evaluate((el, i) => {
        const byId = (ids) => (ids ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
        return {
          key: `${el.getAttribute('class') ?? ''}#${el.getAttribute('aria-labelledby') ?? i}`,
          role: el.getAttribute('role'),
          title: el.querySelector(':scope > title')?.textContent?.trim() ?? '',
          desc: byId(el.getAttribute('aria-describedby')),
          visible: el.getBoundingClientRect().width > 0,
        };
      }, i);
      const snap = dom.visible ? await s.ariaSnapshot() : '';
      const name = snapName(snap, 'img');
      const id = `${route} ${dom.key}`;
      const row = svgRows.get(id) ?? { route, title: dom.title, desc: dom.desc, role: dom.role, checked: [], ok: true };
      if (dom.visible) {
        row.checked.push(width);
        if (dom.role !== 'img' || !name || name !== dom.title || !dom.desc) row.ok = false;
      }
      svgRows.set(id, row);
    }
    const imgState = await page.$$eval('main img', (els) => els.map((e) => !!e.getAttribute('alt')?.trim()));
    imgs += imgState.length;
    imgsOk += imgState.filter(Boolean).length;
    const sk = await page.$$eval('.sk', (els) =>
      els.map((f) => {
        const frame = f.querySelector('.sk-frame');
        return frame?.getAttribute('role') === 'img' && frame.getAttribute('aria-label') === 'Illustrative interface' && f.querySelector('figcaption')?.textContent.trim() === 'Illustrative interface';
      })
    );
    sketches += sk.length;
    sketchesOk += sk.filter(Boolean).length;

    if (width === 1440) {
      const links = page.locator('a').filter({ hasText: 'case study' }).filter({ has: page.locator('.arrowlink-label') });
      const count = await links.count();
      const names = [];
      for (let i = 0; i < count; i++) {
        const href = await links.nth(i).getAttribute('href');
        const snap = await links.nth(i).ariaSnapshot();
        const name = snapName(snap, 'link') ?? '';
        names.push({ href, name, client: CLIENTS[href] });
      }
      if (count) {
        const unique = new Set(names.map((x) => x.name)).size === names.length;
        const named = names.every((x) => x.client && x.name.includes(x.client));
        linkNameRows.push({ route, count, unique, named, tails: names.map((x) => x.name.slice(x.name.lastIndexOf('Read the'))) });
        if (!unique) problems.push(`${route}: case-study links share an accessible name`);
        if (!named) problems.push(`${route}: a case-study link's name does not include its client`);
      }
    }
  }
  await page.close();
}
for (const [id, row] of svgRows) {
  if (!row.checked.length) problems.push(`${id}: SVG never visible at 1440 or 375, so not checked`);
  else if (!row.ok) problems.push(`${id}: SVG without role="img", a name matching its <title>, or a <desc>`);
}
if (imgs !== imgsOk) problems.push(`${imgs - imgsOk} <img> without alt`);
if (sketches !== sketchesOk) problems.push(`${sketches - sketchesOk} interface sketches not named "Illustrative interface"`);

const nfPage = await browser.newPage({ viewport: { width: 320, height: 800 } });
await nfPage.goto(`${server.origin}/no-such-page`, { waitUntil: 'load' });
const nfScroll = await nfPage.evaluate(() => document.documentElement.scrollWidth);
if (nfScroll > 320) problems.push(`404 scrolls horizontally at 320 (${nfScroll}px)`);
await browser.close();
await server.close();

// Report.
const yes = (v) => (v === null ? '-' : v ? 'yes' : 'NO');
console.log(`TECHNICAL SEO: ${DIST.replace(ROOT, '') || DIST} (${mode} build)\n`);
console.log('1. ONE URL PER PAGE: canonical = og:url = JSON-LD url = sitemap <loc> = served 200');
console.log('  ' + 'route'.padEnd(42) + 'canon'.padEnd(7) + 'og:url'.padEnd(8) + 'ld'.padEnd(5) + 'sitemap'.padEnd(9) + 'served'.padEnd(8) + 'lastmod');
for (const r of urlRows) {
  console.log('  ' + r.route.padEnd(42) + yes(r.canonical).padEnd(7) + yes(r.ogUrl).padEnd(8) + yes(r.ld).padEnd(5) + yes(r.sitemap).padEnd(9) + yes(r.served).padEnd(8) + (r.lastmod ?? (production ? 'omitted' : '-')));
}
console.log(`  internal link targets: ${linkRows.length}, answering 200 with no redirect: ${linkRows.filter((l) => l.ok).length}`);

console.log('\n2. TITLES AND DESCRIPTIONS');
for (const r of titleRows) console.log(`  ${r.route.padEnd(42)} ${String(r.tl).padStart(2)}  ${String(r.dl).padStart(3)}  ${r.flags.length ? r.flags.join(', ') : 'ok'}   ${r.title}`);

console.log('\n3. HEADING OUTLINES');
for (const [route, o] of outlines) {
  console.log(`  ${route}   (h1: ${o.h1}, skipped levels: ${o.skips.length}, in SVG: ${o.inSvg ? 'yes' : 'no'})`);
  for (const h of o.hs) console.log(`  ${'  '.repeat(h.level)}h${h.level} ${h.text.length > 78 ? h.text.slice(0, 77) + '…' : h.text}`);
}

console.log('\n4. CRAWL AND SOCIAL');
console.log(`  clicks from /: ${ROUTES.map((r) => `${r} ${depth.get(r) ?? '∞'}`).join(' · ')}`);
console.log(`  lang="en": ${[...pages.values()].filter((p) => p.lang === 'en').length}/${pages.size} · hreflang: ${[...pages.values()].filter((p) => p.hreflang).length}`);
console.log(`  og:type article: ${ARTICLES.filter((r) => pages.get(r).ogType === 'article').length}/4 · og-card.png ${ogDims} · Twitter set complete: ${[...pages.values()].filter((p) => p.twitter.every(Boolean)).length}/${pages.size}`);
console.log(`  404: unknown URL answers ${nf.status}; robots "${pages.get('/404').robots}"; no canonical: ${pages.get('/404').canonical ? 'NO' : 'yes'}; width at 320: ${nfScroll}px`);
for (const [label, ok] of modeChecks) console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);

console.log('\n5. IN THE BROWSER');
for (const r of cspRows) console.log(`  ${r.name.padEnd(9)} CSP violations ${r.violations} · motion script ran on ${r.ran}/${ROUTES.length + 1} pages`);
console.log(`  SVGs (checked at 1440 and 375, each where it is shown):`);
for (const [id, r] of svgRows) console.log(`    ${r.ok ? 'ok  ' : 'FAIL'} ${r.route.padEnd(12)} role=${r.role} @${r.checked.join('+')}  "${r.title}"  / desc ${r.desc.length} chars`);
console.log(`  <img> with alt: ${imgsOk}/${imgs} · interface sketches named "Illustrative interface" with caption: ${sketchesOk}/${sketches}`);
console.log(`  "Read the case study" links (accessible name, from its visible label on):`);
for (const r of linkNameRows) console.log(`    ${r.route.padEnd(20)} ${r.count} links, unique ${yes(r.unique)}, client in name ${yes(r.named)}: ${r.tails.map((t) => `"${t}"`).join(', ')}`);

if (problems.length) {
  console.log('\nPROBLEMS');
  for (const p of problems) console.log(`  ${p}`);
}
console.log(problems.length ? `\nRESULT: FAIL (${problems.length})` : '\nRESULT: PASS');
process.exit(problems.length ? 1 : 0);
