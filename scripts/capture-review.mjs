// Screenshots every round-1 section at 1440 and 375 into
// verification/round1/<label>/, with motion reduced so every element is in its
// final state. Usage: node scripts/capture-review.mjs before|after
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist } from './serve.mjs';
import { SECTIONS, regionOf } from './review-sections.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const label = process.argv[2] || 'after';
const OUT = join(ROOT, 'verification', 'round1', label);
await mkdir(OUT, { recursive: true });

const server = await serveDist(join(ROOT, 'dist'), 4560);
const browser = await chromium.launch();
const missing = [];

for (const width of [1440, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  let current = null;
  for (const s of SECTIONS) {
    if (current !== s.route) {
      await page.goto(server.origin + s.route, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      current = s.route;
    }
    const clip = await page.evaluate(regionOf, s);
    if (!clip) { missing.push(`${s.id} @${width}`); continue; }
    await page.screenshot({ path: join(OUT, `${s.id}-${width}.png`), clip, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
await server.close();
console.log(`captured ${SECTIONS.length * 2 - missing.length} regions into verification/round1/${label}/`);
if (missing.length) { console.log('missing:', missing.join(', ')); process.exit(1); }
