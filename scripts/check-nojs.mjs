// Verification 3: every page renders complete with JavaScript disabled.
// Screenshots each route with javaScriptEnabled:false and asserts the page is
// not blank — measured as rendered height, visible text length, and a count of
// elements that are present in the DOM but invisible.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, slugOf } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'nojs');
await mkdir(OUT, { recursive: true });

const server = await serveDist(join(ROOT, 'dist'), 4321);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  javaScriptEnabled: false,
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});

const rows = [];

for (const route of ROUTES) {
  const page = await ctx.newPage();
  await page.goto(server.origin + route, { waitUntil: 'load' });

  const metrics = await page.evaluate(() => {
    const text = (document.body.innerText || '').trim();
    const all = [...document.querySelectorAll('body *')];

    // Legitimately not rendered at this viewport, and not content hidden from
    // a non-JS reader:
    //   [data-responsive-alt]  one half of a responsive pair; the other half is
    //                          showing at this width
    //   details:not([open])    a collapsed disclosure the user opens with no JS
    //   .skip-link             positioned off-screen until focused
    //   .nav-desk / .menu      the desktop/mobile navigation pair
    //   [data-js-control]      a control that only works with JavaScript (the
    //                          fit check's boxes, meter and button); the
    //                          content it acts on is showing
    const excused = (el) =>
      el.closest('[data-responsive-alt]') ||
      el.closest('[data-js-control]') ||
      el.closest('details:not([open])') ||
      el.closest('.skip-link') ||
      el.closest('.nav-desk') ||
      el.closest('.menu') ||
      el.closest('.idx-wrap');

    const hiddenEls = all.filter((el) => {
      if (excused(el)) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      return parseFloat(cs.opacity) === 0;
    });
    const hidden = hiddenEls.length;
    const hiddenWhat = hiddenEls
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
    return {
      height: document.documentElement.scrollHeight,
      textLength: text.length,
      elements: all.length,
      hidden,
      hiddenWhat,
      h1: document.querySelector('h1')?.textContent?.trim().slice(0, 40) ?? '(none)',
    };
  });

  await page.screenshot({ path: join(OUT, `${slugOf(route)}.png`), fullPage: true });
  await page.close();

  const blank = metrics.textLength < 400 || metrics.height < 600;
  rows.push({ route, ...metrics, ok: !blank && metrics.hidden === 0 });
}

await ctx.close();
await browser.close();
await server.close();

console.log('CHECK: every route renders complete with JavaScript disabled');
console.log('');
console.log(
  '  ' +
    'route'.padEnd(42) +
    'height'.padStart(8) +
    'text'.padStart(8) +
    'els'.padStart(6) +
    'hidden'.padStart(8) +
    '  h1'
);
for (const r of rows) {
  console.log(
    '  ' +
      r.route.padEnd(42) +
      String(r.height).padStart(8) +
      String(r.textLength).padStart(8) +
      String(r.elements).padStart(6) +
      String(r.hidden).padStart(8) +
      '  ' +
      r.h1
  );
}

const failed = rows.filter((r) => !r.ok);
console.log('');
console.log(`  screenshots: verification/nojs/*.png (${rows.length})`);
console.log(failed.length === 0 ? '  RESULT: PASS' : `  RESULT: FAIL (${failed.length})`);
for (const f of failed)
  console.log(`    ${f.route}: hidden=${f.hidden} [${f.hiddenWhat.join(', ')}] text=${f.textLength}`);
process.exit(failed.length === 0 ? 0 : 1);
