// What the grain overlay and the self-hosted fonts actually cost.
//
// Lighthouse names neither, so this measures them directly: the built site is
// copied three more times, each copy with one thing switched off, and all four
// are measured the same way — Lighthouse mobile on the homepage for load, and a
// scripted scroll under 4x CPU throttling for frame cost, which is where a
// fixed full-page overlay would show up.
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { cp, readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORK = join(ROOT, 'verification', 'cost');
const DIST = join(ROOT, 'dist');
const ROUTE = '/';

const GRAIN_OFF = '<style>body::after{display:none!important}</style>';
const FONTS_OFF = '<style>*,*::before,*::after{font-family:system-ui,-apple-system,sans-serif!important}</style>';

const VARIANTS = [
  { id: 'baseline', label: 'as built', inject: '' },
  { id: 'nograin', label: 'grain overlay off', inject: GRAIN_OFF },
  { id: 'nofonts', label: 'self-hosted fonts off', inject: FONTS_OFF },
  { id: 'neither', label: 'both off', inject: GRAIN_OFF + FONTS_OFF },
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

await rm(WORK, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

for (const v of VARIANTS) {
  const dir = join(WORK, v.id);
  await cp(DIST, dir, { recursive: true });
  if (!v.inject) continue;
  for (const file of await walk(dir)) {
    const html = await readFile(file, 'utf8');
    await writeFile(file, html.replace('</head>', `${v.inject}</head>`));
  }
}

// Font bytes actually shipped, straight off disk.
const assets = join(DIST, '_astro');
const fontFiles = (await readdir(assets)).filter((f) => f.endsWith('.woff2'));
let fontBytes = 0;
for (const f of fontFiles) fontBytes += (await readFile(join(assets, f))).length;
const cssFiles = (await readdir(assets)).filter((f) => f.endsWith('.css'));
let cssBytes = 0;
for (const f of cssFiles) cssBytes += (await readFile(join(assets, f))).length;
const grainBytes = (await readFile(join(ROOT, 'src/styles/base.css'), 'utf8')).match(/url\("data:image\/svg\+xml,[^"]+"\)/)?.[0].length ?? 0;

// A fifth variant, and the only optimisation considered: preload exactly the
// font files the homepage actually requests, so they start downloading with the
// CSS rather than after it. Which files those are is observed, not assumed —
// preloading the latin-ext faces nobody uses would cost more than it saves.
{
  const probe = await serveDist(DIST, 4519);
  const browser0 = await chromium.launch();
  const page0 = await browser0.newPage({ viewport: { width: 390, height: 844 } });
  const fonts = new Set();
  page0.on('response', (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith('.woff2')) fonts.add(u.pathname);
  });
  await page0.goto(probe.origin + ROUTE, { waitUntil: 'load' });
  await page0.evaluate(() => document.fonts.ready);
  await page0.waitForTimeout(500);
  await browser0.close();
  await probe.close();

  const links = [...fonts]
    .map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${f}">`)
    .join('');
  VARIANTS.push({ id: 'preload', label: `as built + preload (${fonts.size})`, inject: links });

  const dir = join(WORK, 'preload');
  await cp(DIST, dir, { recursive: true });
  for (const file of await walk(dir)) {
    const html = await readFile(file, 'utf8');
    await writeFile(file, html.replace('</head>', `${links}</head>`));
  }
}

const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});
const browser = await chromium.launch();
const rows = [];
let port = 4520;

for (const v of VARIANTS) {
  const server = await serveDist(join(WORK, v.id), port++);
  const run = await lighthouse(server.origin + ROUTE, {
    port: chrome.port, output: 'json', onlyCategories: ['performance'], logLevel: 'error',
  });
  const lhr = run.lhr;
  const num = (id) => lhr.audits[id]?.numericValue ?? 0;

  // Frame cost during a scroll, CPU throttled 4x, motion off so only paint is measured.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(server.origin + ROUTE, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const times = [];
        let last = performance.now();
        let n = 0;
        const step = () => {
          const now = performance.now();
          times.push(now - last);
          last = now;
          window.scrollBy(0, 36);
          if (++n < 140) requestAnimationFrame(step);
          else resolve(times.slice(5));
        };
        requestAnimationFrame(step);
      })
  );
  await ctx.close();
  await server.close();

  const sorted = [...frames].sort((a, b) => a - b);
  rows.push({
    ...v,
    score: Math.round(lhr.categories.performance.score * 100),
    fcp: num('first-contentful-paint'),
    lcp: num('largest-contentful-paint'),
    tbt: num('total-blocking-time'),
    bytes: num('total-byte-weight'),
    frameMean: frames.reduce((a, b) => a + b, 0) / frames.length,
    frameP95: sorted[Math.floor(sorted.length * 0.95)],
  });
}

await browser.close();
await chrome.kill();
await rm(WORK, { recursive: true, force: true });

const base = rows[0];
console.log('WHAT EACH THING COSTS — homepage, Lighthouse mobile + a 4x-throttled scroll\n');
console.log('  ' + 'variant'.padEnd(24) + 'perf'.padEnd(7) + 'FCP'.padEnd(9) + 'LCP'.padEnd(9) + 'TBT'.padEnd(8) + 'page'.padEnd(10) + 'frame mean'.padEnd(13) + 'frame p95');
for (const r of rows) {
  console.log(
    '  ' + r.label.padEnd(24) + String(r.score).padEnd(7) +
      `${Math.round(r.fcp)}ms`.padEnd(9) + `${Math.round(r.lcp)}ms`.padEnd(9) + `${Math.round(r.tbt)}ms`.padEnd(8) +
      `${(r.bytes / 1024).toFixed(0)} KB`.padEnd(10) +
      `${r.frameMean.toFixed(1)}ms`.padEnd(13) + `${r.frameP95.toFixed(1)}ms`
  );
}

const delta = (r, k) => (r[k] - base[k]);
console.log('\n  cost of each, against as-built:');
for (const r of rows.slice(1)) {
  console.log(
    `    ${r.label.padEnd(24)} LCP ${delta(r, 'lcp') >= 0 ? '+' : ''}${Math.round(delta(r, 'lcp'))}ms   ` +
      `page ${delta(r, 'bytes') >= 0 ? '+' : ''}${(delta(r, 'bytes') / 1024).toFixed(0)} KB   ` +
      `frame mean ${delta(r, 'frameMean') >= 0 ? '+' : ''}${delta(r, 'frameMean').toFixed(1)}ms`
  );
}

console.log('\n  on disk:');
console.log(`    fonts      ${fontFiles.length} woff2, ${(fontBytes / 1024).toFixed(0)} KB total`);
console.log(`    css        ${cssFiles.length} file(s), ${(cssBytes / 1024).toFixed(0)} KB uncompressed`);
console.log(`    grain      ${grainBytes} bytes of inline data URI, 0 network requests`);
