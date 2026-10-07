// The redirect map, checked row by row.
//
//   node scripts/check-redirects.mjs                  local: dist/ through the Vercel emulator
//   DIST=path node scripts/check-redirects.mjs        local, another build
//   ORIGIN=https://… node scripts/check-redirects.mjs live, on that deployment's host
//
// The rows are read from the table in docs/redirects.md, so the approved map
// and the check cannot drift apart. Every concrete old URL is requested in
// both slash forms on each host: the apex, www, and the preview. So is every
// current route. The first response must be exactly what the table says, and
// a redirect's target must answer 200 or 410 straight away: one hop, no chain,
// no loop.
//
// It also checks the headers vercel.json sets: the security set on every page,
// X-Robots-Tag: noindex on every host but kaltech.online, and immutable
// caching on /_astro/ (where the fonts are).
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveVercel, get } from './vercel-emulator.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = process.env.DIST ?? join(ROOT, 'dist');
const ORIGIN = process.env.ORIGIN ?? null;
const APEX = 'kaltech.online';
const WWW = 'www.kaltech.online';
const PREVIEW = 'kaltech-site.vercel.app';

// The map, from the doc.
const doc = await readFile(join(ROOT, 'docs', 'redirects.md'), 'utf8');
const section = doc.slice(doc.indexOf('## The map'), doc.indexOf('## How the rules'));
const rows = [...section.matchAll(/^\| `([^`]+)` \| (\d{3}) \| (?:`([^`]+)`|none) \|/gm)]
  .map((m) => ({ old: m[1], status: +m[2], target: m[3] ?? null }))
  .filter((r) => !r.old.includes('{'))
  .map((r) => {
    // A row written with the www host applies to that host only, and its
    // target is absolute.
    const www = r.old.match(/^https:\/\/www\.kaltech\.online(\/.*)?$/);
    if (www) return { ...r, host: 'www.kaltech.online', old: www[1] || '/', absoluteTarget: r.target };
    return {
      ...r,
      old: r.old.replace(/^https:\/\/kaltech\.online/, '') || '/',
      target: r.target ? r.target.replace(/^https:\/\/kaltech\.online/, '') || '/' : null,
    };
  });
if (rows.length < 20) throw new Error(`Read only ${rows.length} rows from docs/redirects.md.`);

// Transport: the emulator with a Host header, or the live origin.
let server = null;
let request;
let hosts;
if (ORIGIN) {
  const live = new URL(ORIGIN);
  hosts = [live.host];
  request = async (host, path) => {
    const res = await fetch(`${live.protocol}//${host}${path}`, { redirect: 'manual', headers: { 'user-agent': 'KalTech-redirect-check/1.0' } });
    return { status: res.status, headers: Object.fromEntries(res.headers), body: res.status < 300 ? await res.text() : '' };
  };
} else {
  server = await serveVercel(DIST, 4710);
  hosts = [APEX, WWW, PREVIEW];
  request = (host, path) => get(server.port, host, path);
}
const production = !ORIGIN && (await readdir(DIST)).includes('sitemap.xml');

const absolute = (host, location) => new URL(location, `https://${host}`).href;

// What each host should answer for one path, given the row's own verdict.
function expectFor(host, path, status, target) {
  if (host === WWW) {
    if (status === 301) return { status: 301, location: `https://${APEX}${target}` };
    if (status === 410) return { status: 301, location: `https://${APEX}${path}`, then: 410 };
    return { status: 301, location: `https://${APEX}${path}`, then: status };
  }
  if (status === 301) return { status: 301, location: `https://${host}${target}` };
  return { status };
}

const results = [];
async function check(host, path, want, label) {
  const first = await request(host, path);
  const location = first.headers.location ? absolute(host, first.headers.location) : null;
  let final = first.status;
  let hops = 0;
  let second = null;
  if (first.status >= 300 && first.status < 400 && location) {
    hops = 1;
    const u = new URL(location);
    second = await request(u.host, u.pathname + u.search);
    final = second.status;
    if (second.status >= 300 && second.status < 400) hops = 2;
  }
  const wantFinal = want.then ?? (want.status === 301 ? 200 : want.status);
  const ok =
    first.status === want.status &&
    (want.location ? location === want.location : !location) &&
    final === wantFinal &&
    (want.then ? hops === 1 : hops <= 1);
  results.push({ label, host, path, first: first.status, location, final, hops, ok, want });
  return { first, second };
}

// 1. Every concrete row of the map, on each host. The table lists each slash
// form as its own row.
for (const r of rows) {
  if (r.host) {
    if (hosts.includes(r.host)) await check(r.host, r.old, { status: r.status, location: r.absoluteTarget }, 'map');
    continue;
  }
  if (r.old === '/sitemap.xml' && !production) {
    for (const host of hosts) await check(host, r.old, expectFor(host, r.old, 404, null), 'map (preview: no sitemap)');
    continue;
  }
  for (const host of hosts) await check(host, r.old, expectFor(host, r.old, r.status, r.target), 'map');
}

// 2. Every current route, and its trailing-slash form.
for (const route of ROUTES) {
  for (const host of hosts) {
    await check(host, route, expectFor(host, route, 200, null), 'route');
    if (route !== '/') await check(host, `${route}/`, expectFor(host, `${route}/`, 301, route), 'route/');
  }
}

// 3. A URL that never existed: 404, the site's own page, noindex.
const missing = {};
for (const host of hosts) {
  const { first } = await check(host, '/this-page-does-not-exist', expectFor(host, '/this-page-does-not-exist', 404, null), '404');
  if (host !== WWW) missing[host] = first;
}

// 4. Headers.
const headerRows = [];
const want = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
};
for (const host of hosts.filter((h) => h !== WWW)) {
  const page = await request(host, '/work');
  const csp = page.headers['content-security-policy'] ?? '';
  const robotsHeader = page.headers['x-robots-tag'] ?? null;
  const expectNoindex = host !== APEX;
  const ok =
    Object.entries(want).every(([k, v]) => page.headers[k] === v) &&
    /script-src 'self' 'sha256-[^']+'/.test(csp) &&
    !/script-src[^;]*'unsafe-inline'/.test(csp) &&
    (expectNoindex ? robotsHeader === 'noindex' : robotsHeader === null) &&
    !('strict-transport-security' in page.headers && !ORIGIN);
  headerRows.push({
    host,
    ok,
    detail: `nosniff ${page.headers['x-content-type-options'] ?? '-'} · referrer ${page.headers['referrer-policy'] ?? '-'} · permissions ${page.headers['permissions-policy'] ? 'set' : '-'} · CSP ${csp ? 'set' : '-'} · X-Robots-Tag ${robotsHeader ?? 'none'}`,
  });
}
// Immutable caching on every built asset under /_astro/, fonts included.
const assets = ORIGIN ? [] : (await readdir(join(DIST, '_astro'))).filter((f) => /\.(css|js|woff2?)$/.test(f));
let cacheOk = 0;
for (const f of assets) {
  const res = await request(APEX, `/_astro/${f}`);
  if (res.status === 200 && res.headers['cache-control'] === 'public, max-age=31536000, immutable') cacheOk++;
}
const fonts = assets.filter((f) => /\.woff2?$/.test(f)).length;
const strayFonts = ORIGIN ? [] : (await readdir(DIST, { recursive: true })).filter((f) => /\.woff2?$/.test(f) && !f.startsWith('_astro'));

// 5. The 404 body is the site's own page.
const nf = missing[APEX] ?? missing[hosts[0]];
const nfOk = nf && /<h1[^>]*>There is no page at this address\.<\/h1>/.test(nf.body) && /<meta name="robots" content="noindex/.test(nf.body) && /class="hdr/.test(nf.body) && /class="ftr/.test(nf.body) && ['/work', '/services', '/'].every((h) => nf.body.includes(`href="${h}"`));

if (server) await server.close();

// Report.
const fmt = (r) => `${r.first}${r.location ? ` → ${r.location.replace('https://', '')}` : ''}${r.hops ? ` → ${r.final}` : ''}`;
console.log(`REDIRECT MAP: ${ORIGIN ? `live, ${ORIGIN}` : `local emulator over ${DIST.replace(ROOT, '')}`} (${production ? 'production' : 'preview'} build)`);
console.log(`  ${rows.length} concrete rows read from docs/redirects.md; hosts: ${hosts.join(', ')}\n`);
console.log('  ' + 'path'.padEnd(30) + hosts.map((h) => h.padEnd(62)).join(''));
const byPath = new Map();
for (const r of results.filter((r) => r.label.startsWith('map'))) {
  if (!byPath.has(r.path)) byPath.set(r.path, new Map());
  byPath.get(r.path).set(r.host, r);
}
for (const [path, byHost] of byPath) {
  console.log('  ' + path.padEnd(30) + hosts.map((h) => (byHost.has(h) ? `${fmt(byHost.get(h))}${byHost.get(h).ok ? '' : '  FAIL'}` : '').padEnd(62)).join(''));
}
const routeResults = results.filter((r) => r.label.startsWith('route'));
const nfResults = results.filter((r) => r.label === '404');
console.log(`\n  current routes: ${routeResults.filter((r) => r.ok).length}/${routeResults.length} as expected (13 routes and their slash forms on ${hosts.length} host(s))`);
for (const r of routeResults.filter((r) => !r.ok)) console.log(`    FAIL ${r.host}${r.path}: ${fmt(r)}`);
console.log(`  unknown URL: ${nfResults.map((r) => `${r.host} ${fmt(r)}`).join(' · ')}  ${nfResults.every((r) => r.ok) ? '' : 'FAIL'}`);
console.log(`  404 body: header, footer, one H1, noindex, links to /work, /services and /: ${nfOk ? 'yes' : 'NO'}`);
const chains = results.filter((r) => r.hops > 1);
console.log(`  chains (a redirect to a redirect): ${chains.length}${chains.length ? ' — ' + chains.map((r) => r.host + r.path).join(', ') : ''}`);
console.log('\nHEADERS');
for (const h of headerRows) console.log(`  ${h.host.padEnd(26)} ${h.detail}  ${h.ok ? 'ok' : 'FAIL'}`);
if (!ORIGIN) {
  console.log(`  /_astro/ assets with immutable caching: ${cacheOk}/${assets.length} (${fonts} of them fonts); fonts outside /_astro/: ${strayFonts.length}`);
  console.log(`  Strict-Transport-Security: not set in vercel.json (Vercel's default applies)`);
}

const failures =
  results.filter((r) => !r.ok).length + headerRows.filter((h) => !h.ok).length + (nfOk ? 0 : 1) + (cacheOk === assets.length ? 0 : 1) + strayFonts.length;
console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
