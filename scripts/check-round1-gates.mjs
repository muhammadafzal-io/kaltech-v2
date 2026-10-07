// The three gated elements, opened in a throwaway build.
//
// The homepage Clients gate (five confirmed countries opens the figures and
// the map; six confirmed names then adds the strip) and the About overlap
// strip (showOverlap) are built but switched off. This writes sample data, builds into verification/round1/
// gates-dist, screenshots and measures the opened elements, and restores the
// data files byte for byte, whatever happens. Nothing here reaches dist/.
//
// The sample names and countries are test values only and are labelled so.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'round1', 'gates');
const DIST = join(ROOT, 'verification', 'round1', 'gates-dist');
await mkdir(OUT, { recursive: true });

const files = {
  footprint: join(ROOT, 'src/data/footprint.json'),
  locations: join(ROOT, 'src/data/locations.json'),
};
const original = {};
for (const [k, f] of Object.entries(files)) original[k] = await readFile(f);
const sha = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);

let failures = 0;
try {
  const fp = JSON.parse(original.footprint);
  fp.clients = [
    ...fp.clients,
    { name: 'Test client D', confirmed: true },
    { name: 'Test client E', confirmed: true },
    { name: 'Test client F', confirmed: true },
  ];
  fp.countries = [
    { country: 'United States of America', confirmed: true },
    { country: 'United Kingdom', confirmed: true },
    { country: 'United Arab Emirates', confirmed: true },
    { country: 'Pakistan', confirmed: true },
    { country: 'Saudi Arabia', confirmed: true },
    { country: '[PLACEHOLDER]', confirmed: false },
    { country: '[PLACEHOLDER]', confirmed: false },
  ];
  await writeFile(files.footprint, JSON.stringify(fp, null, 2) + '\n');

  const loc = JSON.parse(original.locations);
  loc.showOverlap = true;
  await writeFile(files.locations, JSON.stringify(loc, null, 2) + '\n');

  execFileSync('npx', ['astro', 'build', '--outDir', DIST], { cwd: ROOT, stdio: 'ignore' });
} finally {
  for (const [k, f] of Object.entries(files)) await writeFile(f, original[k]);
}

const restored = await Promise.all(Object.entries(files).map(async ([k, f]) => sha(await readFile(f)) === sha(original[k])));
console.log(`data files restored byte for byte: ${restored.every(Boolean) ? 'yes' : 'NO'}`);
if (!restored.every(Boolean)) failures++;

const server = await serveDist(DIST, 4590);
const browser = await chromium.launch();

for (const width of [1440, 375]) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });

  await page.goto(server.origin + '/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const home = await page.evaluate(() => {
    const sec = document.querySelector('[data-review="home-01"]');
    return {
      map: !!sec.querySelector('.wmap'),
      markers: [...sec.querySelectorAll('.wmap-marker')].map((m) => m.textContent.trim()),
      stacked: !!sec.querySelector('.clients-stack'),
      figs: [...sec.querySelectorAll('.fig-value')].map((f) => f.textContent.trim()),
      quotes: sec.querySelectorAll('.quote-item').length,
      strip: [...sec.querySelectorAll('.logostrip-row')].map((r) => r.querySelectorAll('.logostrip-name').length),
      rowHeight: sec.querySelector('.logostrip-row') ? Math.round(sec.querySelector('.logostrip-row').getBoundingClientRect().height) : 0,
      placeholder: sec.textContent.includes('[PLACEHOLDER]'),
      scroll: document.documentElement.scrollWidth,
    };
  });
  await page.locator('[data-review="home-01"]').screenshot({ path: join(OUT, `home-clients-open-${width}.png`) });
  const homeOk = home.map && home.markers.length === 5 && home.stacked && home.figs.length === 3 && home.quotes === 3 && home.strip.join() === '6' && !home.placeholder && home.scroll <= width;
  if (!homeOk) failures++;
  console.log(`${width}px  home: map ${home.map ? 'shown' : 'absent'} with ${home.markers.length} markers (${home.markers.join(', ')}); figures ${home.figs.join(' / ')} stacked: ${home.stacked ? 'yes' : 'no'}; testimonials ${home.quotes}; strip rows ${home.strip.join(' + ')} names, ${home.rowHeight}px tall; unconfirmed [PLACEHOLDER] rendered: ${home.placeholder ? 'yes' : 'no'}; page width ${home.scroll}  ${homeOk ? 'PASS' : 'FAIL'}`);

  await page.goto(server.origin + '/about', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const ovl = await page.evaluate(() => {
    const root = document.querySelector('.ovl');
    if (!root) return null;
    const px = (el) => el.getBoundingClientRect();
    const rows = [...root.querySelectorAll('.ovl-row')].map((r) => {
      const track = px(r.querySelector('.ovl-track'));
      const hrs = (els) => [...els].reduce((s, e) => s + (px(e).width / track.width) * 24, 0);
      return { name: r.querySelector('.ovl-name').textContent.trim(), hours: +hrs(r.querySelectorAll('.ovl-hours')).toFixed(1), shared: +hrs(r.querySelectorAll('.ovl-shared')).toFixed(1) };
    });
    const sizes = [...root.querySelectorAll('.ovl-tick, .ovl-name, .ovl-title')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => parseFloat(getComputedStyle(e).fontSize));
    return { rows, minFont: Math.min(...sizes), title: root.querySelector('.ovl-title').textContent.trim(), scroll: document.documentElement.scrollWidth };
  });
  await page.locator('[data-review="about-03"]').screenshot({ path: join(OUT, `about-overlap-open-${width}.png`) });
  const want = { 'US East': 0, UK: 3, GCC: 7 };
  const ovlOk = ovl && ovl.rows.length === 4 && ovl.rows.every((r) => !(r.name in want) || Math.abs(r.shared - want[r.name]) < 0.15) && ovl.minFont >= 12 && ovl.scroll <= width;
  if (!ovlOk) failures++;
  console.log(`${width}px  about: overlap strip ${ovl ? 'shown' : 'absent'} — ${ovl ? ovl.rows.map((r) => `${r.name} ${r.hours}h, ${r.shared}h shared with Lahore`).join('; ') : ''}; smallest text ${ovl?.minFont}px; page width ${ovl?.scroll}  ${ovlOk ? 'PASS' : 'FAIL'}`);
  await page.close();
}

await browser.close();
await server.close();
console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
