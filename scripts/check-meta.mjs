// Per-page meta and structured data, read out of the built HTML.
//
// Checks per route: one title, unique, 15-60 characters, ending " | KalTech".
// One description, unique, 150-160. A canonical that matches the route. The
// Open Graph and Twitter set. Icons that resolve to files that exist. Exactly
// one h1. And the JSON-LD @graph parsing, with no empty or undefined values.
// The crawl files follow the build's mode: a preview build (noindex on every
// page) has a disallow-all robots.txt and no sitemap; a production build's
// sitemap lists every route and nothing else. scripts/check-seo.mjs and
// scripts/check-schema.mjs go further.
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = process.env.DIST ?? join(ROOT, 'dist');
const SITE = 'https://kaltech.online';

const TITLE = [15, 60];
const DESC = [150, 160];

const file = (route) => join(DIST, route === '/' ? 'index.html' : route.replace(/^\//, '') + '/index.html');
const attr = (tag, name) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? null;
const meta = (html, kind, value) => {
  const re = new RegExp(`<meta[^>]*${kind}="${value}"[^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? attr(tag, 'content') : null;
};
const exists = async (p) => access(join(DIST, p.replace(/^\//, ''))).then(() => true, () => false);

const rows = [];
const problems = [];

for (const route of ROUTES) {
  const html = await readFile(file(route), 'utf8');

  const titles = [...html.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1]);
  const title = titles[0] ?? '';
  const description = meta(html, 'name', 'description') ?? '';
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0];
  const canonicalHref = canonical ? attr(canonical, 'href') : null;
  const h1s = [...html.matchAll(/<h1[\s>]/g)].length;

  const og = Object.fromEntries(
    ['og:title', 'og:description', 'og:type', 'og:url', 'og:image', 'og:site_name'].map((k) => [k, meta(html, 'property', k)])
  );
  const twitter = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'].every((k) => meta(html, 'name', k));

  const icons = [...html.matchAll(/<link[^>]*rel="(icon|apple-touch-icon)"[^>]*>/g)].map((m) => attr(m[0], 'href'));
  const iconsOk = icons.length ? (await Promise.all(icons.map(exists))).every(Boolean) : false;

  const ld = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const types = [];
  for (const block of ld) {
    try {
      const data = JSON.parse(block);
      for (const node of data['@graph'] ?? [data]) types.push(node['@type']);
      const walk = (o, path = '') => {
        for (const [k, v] of Object.entries(o)) {
          if (v === null || v === undefined || v === '') problems.push(`${route}: JSON-LD ${path}${k} is empty`);
          else if (typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}${k}.`);
        }
      };
      walk(data);
    } catch {
      problems.push(`${route}: JSON-LD does not parse`);
    }
  }

  const expected = SITE + (route === '/' ? '/' : route + '/');
  const canonicalOk = canonicalHref === expected || canonicalHref === SITE + route;

  if (titles.length !== 1) problems.push(`${route}: ${titles.length} title tags`);
  if (title.length < TITLE[0] || title.length > TITLE[1]) problems.push(`${route}: title ${title.length} chars`);
  if (!title.endsWith(' | KalTech')) problems.push(`${route}: title does not end " | KalTech"`);
  if (description.length < DESC[0] || description.length > DESC[1]) problems.push(`${route}: description ${description.length} chars`);
  if (!canonicalOk) problems.push(`${route}: canonical ${canonicalHref}`);
  if (h1s !== 1) problems.push(`${route}: ${h1s} h1 elements`);
  for (const [k, v] of Object.entries(og)) if (!v) problems.push(`${route}: missing ${k}`);
  if (!twitter) problems.push(`${route}: Twitter card, title, description or image missing`);
  if (!iconsOk) problems.push(`${route}: icon link missing or unresolved`);
  if (!types.includes('Organization')) problems.push(`${route}: no Organization JSON-LD`);

  rows.push({ route, title, description, h1s, canonicalOk, og: Object.values(og).every(Boolean), types });
}

// The crawl files follow the mode. A production sitemap must list every built
// page and nothing else: an entry with no page (an article not yet written)
// would otherwise be advertised as a 404.
const homeHtml = await readFile(file('/'), 'utf8');
const preview = /<meta name="robots" content="noindex,nofollow"/.test(homeHtml);
const robots = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => null);
const hasSitemap = await access(join(DIST, 'sitemap.xml')).then(() => true, () => false);
let locs = [];
if (!robots) problems.push('robots.txt missing');
if (preview) {
  if (hasSitemap) problems.push('preview build has a sitemap.xml');
  if (!/User-agent: \*\nDisallow: \/\n/.test(robots ?? '')) problems.push('preview robots.txt does not disallow all');
} else {
  const sitemap = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
  locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname.replace(/\/$/, '') || '/');
  for (const loc of locs) if (!ROUTES.includes(loc)) problems.push(`sitemap lists ${loc}, which is not a built route`);
  for (const route of ROUTES) if (!locs.includes(route)) problems.push(`sitemap is missing ${route}`);
  if (!/Sitemap: https:\/\/kaltech\.online\/sitemap\.xml/.test(robots ?? '')) problems.push('robots.txt does not reference the sitemap');
}

const dupe = (key) => {
  const seen = new Map();
  for (const r of rows) seen.set(r[key], (seen.get(r[key]) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([v]) => v);
};
for (const t of dupe('title')) problems.push(`duplicate title: "${t}"`);
for (const d of dupe('description')) problems.push(`duplicate description: "${d.slice(0, 40)}…"`);

console.log('META AND STRUCTURED DATA: every route, from the built HTML');
console.log(`  title ${TITLE[0]}-${TITLE[1]} chars, description ${DESC[0]}-${DESC[1]}, one h1, canonical, OG set, icons, JSON-LD\n`);
console.log('  ' + 'route'.padEnd(42) + 'title'.padEnd(7) + 'desc'.padEnd(7) + 'h1'.padEnd(5) + 'canon'.padEnd(8) + 'og'.padEnd(5) + 'schema');
for (const r of rows) {
  console.log(
    '  ' + r.route.padEnd(42) + String(r.title.length).padEnd(7) + String(r.description.length).padEnd(7) +
      String(r.h1s).padEnd(5) + (r.canonicalOk ? 'ok' : 'NO').padEnd(8) + (r.og ? 'ok' : 'NO').padEnd(5) + r.types.join(' + ')
  );
}

if (problems.length) {
  console.log('\n  problems:');
  for (const p of problems) console.log(`    ${p}`);
}
console.log(
  preview
    ? '\n  preview build: robots.txt disallows all  ·  no sitemap.xml'
    : `\n  production build: sitemap ${locs.length} URLs, all built  ·  robots.txt allows and references it`
);
console.log(problems.length ? `\n  RESULT: FAIL (${problems.length})` : '\n  RESULT: PASS');
process.exit(problems.length ? 1 : 0);
