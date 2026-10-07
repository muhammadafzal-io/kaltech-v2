// Verification 4: no element carries min-width, and no page scrolls
// horizontally at 320px.
//
// The article data table is the one permitted exception to horizontal scroll
// (CLAUDE.md standing rule 6) and scrolls inside its own wrapper, so the check
// measures the document, not that wrapper.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const server = await serveDist(join(ROOT, 'dist'), 4322);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 320, height: 800 } });

const rows = [];

for (const route of ROUTES) {
  const page = await ctx.newPage();
  await page.goto(server.origin + route, { waitUntil: 'load' });

  const r = await page.evaluate(() => {
    const doc = document.documentElement;

    // min-width, excluding the 0/auto defaults and the intentional 44px tap
    // targets on the menu control.
    // Only a POSITIVE floor is a violation. `min-width: 0` is the fix that
    // makes "no horizontal scroll at 320px" achievable inside a grid, not a
    // breach of it.
    const minWidth = [...document.querySelectorAll('*')]
      .map((el) => ({ el, mw: getComputedStyle(el).minWidth }))
      .filter(({ mw }) => mw && mw !== '0px' && mw !== 'auto' && parseFloat(mw) > 0);

    // Anything sticking out past the viewport.
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0) return false;
        // Elements inside a scroll wrapper are allowed to be wider than it.
        if (el.closest('.table-wrap')) return false;
        // A closed <details> is not showing its panel.
        if (el.closest('details:not([open])')) return false;
        return rect.right > doc.clientWidth + 1 || rect.left < -1;
      })
      .map((el) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);

    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      minWidth: minWidth.map(
        ({ el, mw }) => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}=${mw}`
      ),
      overflowing: [...new Set(overflowing)].slice(0, 5),
    };
  });

  await page.close();

  const hScroll = r.scrollWidth > r.clientWidth;
  rows.push({
    route,
    ...r,
    ok: !hScroll && r.minWidth.length === 0 && r.overflowing.length === 0,
  });
}

await ctx.close();
await browser.close();
await server.close();

console.log('CHECK: no min-width, no horizontal scroll at 320px');
console.log('');
console.log(
  '  ' + 'route'.padEnd(42) + 'scrollW'.padStart(9) + 'clientW'.padStart(9) + 'min-width'.padStart(11) + 'overflow'.padStart(10)
);
for (const r of rows) {
  console.log(
    '  ' +
      r.route.padEnd(42) +
      String(r.scrollWidth).padStart(9) +
      String(r.clientWidth).padStart(9) +
      String(r.minWidth.length).padStart(11) +
      String(r.overflowing.length).padStart(10)
  );
}

const failed = rows.filter((r) => !r.ok);
console.log('');
console.log(failed.length === 0 ? '  RESULT: PASS' : `  RESULT: FAIL (${failed.length})`);
for (const f of failed) {
  if (f.minWidth.length) console.log(`    ${f.route} min-width: ${f.minWidth.slice(0, 5).join(', ')}`);
  if (f.overflowing.length) console.log(`    ${f.route} overflowing: ${f.overflowing.join(', ')}`);
  if (f.scrollWidth > f.clientWidth)
    console.log(`    ${f.route} h-scroll: ${f.scrollWidth} > ${f.clientWidth}`);
}
process.exit(failed.length === 0 ? 0 : 1);
