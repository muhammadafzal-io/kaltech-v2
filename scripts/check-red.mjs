// Red audit: a count, not a judgement.
//
// Policy (ruled after Phase 2): structure is not emphasis, so label rules, device
// rules (.shead-rule, .rail-rule, .rule-struct) and accent borders are not
// counted. One lead figure per group is red and the rest are ink, which the
// markup now renders. The fixed header is persistent chrome and is excluded.
// The cap is 5.
//
// For each route at 375 and 1440, every element rendering --accent or
// --accent-dark is located on the page: text coloured red, a red background,
// a red border, or an SVG shape filled or stroked red. A window one viewport
// high then slides down the whole scroll in 20px steps, and the most red
// elements inside any single window is the route's maximum. Above the cap fails.
//
// The fixed header is page chrome present in every window, so it is counted
// separately and reported next to the content figure rather than inside it.
//
// Pages render with reducedMotion: 'reduce', so every element is in its final
// state without the page having to be scrolled through first.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIMIT = 5;
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1440', width: 1440, height: 900 },
];

const server = await serveDist(join(ROOT, 'dist'), 4460);
const browser = await chromium.launch();
const rows = new Map();

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    reducedMotion: 'reduce',
  });

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const r = await page.evaluate(() => {
      const probe = (v) => {
        const d = document.createElement('div');
        d.style.color = `var(${v})`;
        document.body.appendChild(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const RED = new Set([probe('--accent'), probe('--accent-dark')]);

      const shown = (el) => {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) {
            return false;
          }
        }
        const b = el.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      };

      const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());

      const isRed = (el) => {
        const cs = getComputedStyle(el);
        if (el instanceof SVGElement) {
          if (['svg', 'g', 'defs'].includes(el.tagName)) return null;
          if (cs.fill !== 'none' && RED.has(cs.fill)) return 'fill';
          if (cs.stroke !== 'none' && RED.has(cs.stroke) && parseFloat(cs.strokeWidth) > 0) return 'stroke';
          return null;
        }
        if (ownText(el) && RED.has(cs.color)) return 'text';
        if (RED.has(cs.backgroundColor)) return 'background';
        for (const s of ['Top', 'Right', 'Bottom', 'Left']) {
          if (
            parseFloat(cs[`border${s}Width`]) > 0 &&
            cs[`border${s}Style`] !== 'none' &&
            RED.has(cs[`border${s}Color`])
          ) {
            return 'border';
          }
        }
        return null;
      };

      const fixedAncestor = (el) => {
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          if (getComputedStyle(n).position === 'fixed') return true;
        }
        return false;
      };

      const describe = (el, why) => {
        const cls = typeof el.className === 'string' ? el.className : el.getAttribute('class') || '';
        const text = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24);
        return `${el.tagName.toLowerCase()}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''} [${why}]${text ? ' "' + text + '"' : ''}`;
      };

      const content = [];
      const chrome = [];
      for (const el of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
        const why = isRed(el);
        if (!why || !shown(el)) continue;
        if (why === 'border' || el.matches('.shead-rule, .rail-rule, .rule-struct')) continue;
        const b = el.getBoundingClientRect();
        const item = { top: b.top + scrollY, bottom: b.bottom + scrollY, label: describe(el, why) };
        (fixedAncestor(el) ? chrome : content).push(item);
      }

      const vh = innerHeight;
      const height = document.documentElement.scrollHeight;
      let max = 0;
      let at = 0;
      let worst = [];
      for (let y = 0; y <= Math.max(0, height - vh); y += 20) {
        const inside = content.filter((i) => i.bottom > y && i.top < y + vh);
        if (inside.length > max) {
          max = inside.length;
          at = y;
          worst = inside.map((i) => i.label);
        }
      }
      return { max, at, worst, chrome: chrome.map((i) => i.label), height };
    });

    await page.close();
    if (!rows.has(route)) rows.set(route, {});
    rows.get(route)[vp.name] = r;
  }
  await ctx.close();
}

await browser.close();
await server.close();

console.log('RED AUDIT: most elements rendering --accent / --accent-dark in any one viewport-high window');
console.log('');
console.log(
  '  ' + 'route'.padEnd(42) + '375 max'.padEnd(10) + '1440 max'.padEnd(11) + 'header 375/1440'.padEnd(17) + 'result'
);
let fails = 0;
for (const [route, r] of rows) {
  const bad = r['375'].max > LIMIT || r['1440'].max > LIMIT;
  if (bad) fails++;
  console.log(
    '  ' +
      route.padEnd(42) +
      String(r['375'].max).padEnd(10) +
      String(r['1440'].max).padEnd(11) +
      `${r['375'].chrome.length}/${r['1440'].chrome.length}`.padEnd(17) +
      (bad ? 'FIX' : 'ok')
  );
}

if (process.argv.includes('--detail')) {
  for (const [route, r] of rows) {
    for (const w of ['375', '1440']) {
      if (r[w].max <= LIMIT) continue;
      console.log(`\n  ${route} @${w}  ${r[w].max} in the window at y=${r[w].at}px`);
      for (const l of r[w].worst) console.log(`    ${l}`);
    }
  }
  const any = [...rows.values()][0];
  console.log(`\n  header chrome @1440: ${any['1440'].chrome.join(' | ')}`);
  console.log(`  header chrome @375:  ${any['375'].chrome.join(' | ')}`);
}

console.log(fails ? `\n  RESULT: ${fails} route(s) above ${LIMIT}` : `\n  RESULT: every route at ${LIMIT} or fewer`);
process.exit(fails ? 1 : 0);
