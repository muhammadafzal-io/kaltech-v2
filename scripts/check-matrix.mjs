// Screenshot matrix: every route at 375, 768, 1024 and 1440, with the checks
// that a screenshot alone would not settle — horizontal overflow, clipped text,
// orphaned headline words, collapsed grids, stuck sticky columns, and hover
// states baked into a resting element. One contact sheet per width.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROUTES, slugOf } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'matrix');
await mkdir(OUT, { recursive: true });
const WIDTHS = [375, 768, 1024, 1440];

function audit(width) {
  const doc = document.documentElement;
  const name = (el) =>
    el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const shown = (el) => el.getClientRects().length > 0;

  // Text clipped by its own box.
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!shown(el)) continue;
    // Clipped by design: scrolling tables, image slots, the hidden half of a
    // responsive pair, and screen-reader-only text (.visually-hidden is a 1px clip).
    if (el.closest('.table-wrap, .slot, [data-responsive-alt], .visually-hidden')) continue;
    const cs = getComputedStyle(el);
    if (!/hidden|clip/.test(cs.overflow + cs.overflowX + cs.overflowY)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
    if (!hasText) continue;
    if (el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1) clipped.push(name(el));
  }

  // A headline whose last line is a single word.
  const orphans = [];
  for (const h of document.querySelectorAll('h1, h2')) {
    if (!shown(h)) continue;
    const words = [];
    const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode()); ) {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(n.data))) {
        const r = document.createRange();
        r.setStart(n, m.index);
        r.setEnd(n, m.index + m[0].length);
        words.push({ t: m[0], top: Math.round(r.getBoundingClientRect().top) });
      }
    }
    if (words.length < 3) continue;
    const lastTop = words.at(-1).top;
    if (words.filter((w) => Math.abs(w.top - lastTop) < 6).length === 1) orphans.push(`${name(h)} "${words.at(-1).t}"`);
  }

  // A multi-column grid that has collapsed to one track while there is room.
  const collapsed = [];
  if (width >= 1025) {
    for (const el of document.querySelectorAll('.grid12, .cols-2, .cols-3, .cols-4, .cols-5, .cols-6')) {
      if (!shown(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.display !== 'grid') continue;
      const tracks = cs.gridTemplateColumns.trim().split(/\s+/).length;
      const kids = [...el.children].filter(shown).length;
      // .dx-isnot-pair stacks on purpose while its figures are placeholders.
      if (el.closest('.dx-isnot-pair')) continue;
      if (tracks === 1 && kids > 1 && el.getBoundingClientRect().width > 600) collapsed.push(`${name(el)} (${kids} children)`);
    }
  }

  // A sticky column that cannot stick: not sticky above 1024, or clipped by an
  // ancestor with overflow hidden or clip.
  const sticky = [];
  for (const el of document.querySelectorAll('.sticky')) {
    if (!shown(el)) continue;
    const pos = getComputedStyle(el).position;
    if (width >= 1025 && pos !== 'sticky') sticky.push(`${name(el)} position:${pos}`);
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip/.test(cs.overflowY) || /hidden|clip/.test(cs.overflow)) sticky.push(`${name(el)} clipped by ${name(n)}`);
    }
  }

  // Hover styling must never be present at rest.
  const hovered = [];
  const restCheck = (sel, test, why) => {
    for (const el of document.querySelectorAll(sel)) {
      if (!shown(el)) continue;
      if (test(getComputedStyle(el), el)) hovered.push(`${name(el)} ${why}`);
    }
  };
  restCheck('.arrow, .servicerow-arrow', (cs) => cs.transform !== 'none', 'arrow already travelled');
  restCheck('.toprule', (cs) => parseFloat(cs.height) > 1.5, 'top rule already thickened');
  restCheck('.slot-inner, .slot-img', (cs) => cs.transform !== 'none', 'image already scaled');
  restCheck('.nav-link, .link, .arrowlink-label, .ftr-link', (cs) => !/^0(px|%)/.test(cs.backgroundSize), 'underline already drawn');
  restCheck('.card', (cs, el) => {
    const bg = getComputedStyle(el, '::before').backgroundColor.match(/[\d.]+/g) || [];
    return bg.length < 4 || parseFloat(bg[3]) > 0;
  }, 'card ground already lifted');

  return {
    scrollWidth: doc.scrollWidth,
    clientWidth: doc.clientWidth,
    hScroll: doc.scrollWidth > doc.clientWidth,
    clipped,
    orphans,
    collapsed,
    sticky,
    hovered,
  };
}

const server = await serveDist(join(ROOT, 'dist'), 4505);
const browser = await chromium.launch();
const results = [];

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(OUT, `${slugOf(route)}-${width}.png`), fullPage: true });
    const r = await page.evaluate(audit, width);
    await page.close();
    results.push({ route, width, ...r });
  }
  await ctx.close();
}

console.log('SCREENSHOT MATRIX: every route at 375 / 768 / 1024 / 1440');
console.log('  ' + 'route'.padEnd(42) + 'width'.padEnd(8) + 'h-scroll'.padEnd(10) + 'clipped'.padEnd(9) + 'orphans'.padEnd(9) + 'collapsed'.padEnd(11) + 'sticky'.padEnd(8) + 'hover-at-rest');
let failures = 0;
for (const r of results) {
  const bad = r.hScroll || r.clipped.length || r.collapsed.length || r.sticky.length || r.hovered.length;
  if (bad) failures++;
  console.log(
    '  ' + r.route.padEnd(42) + String(r.width).padEnd(8) + (r.hScroll ? `YES ${r.scrollWidth}` : 'no').padEnd(10) +
      String(r.clipped.length).padEnd(9) + String(r.orphans.length).padEnd(9) + String(r.collapsed.length).padEnd(11) +
      String(r.sticky.length).padEnd(8) + String(r.hovered.length)
  );
  for (const d of [...r.clipped, ...r.collapsed, ...r.sticky, ...r.hovered].slice(0, 4)) console.log(`      ${d}`);
}

const orphanRows = results.filter((r) => r.orphans.length);
if (orphanRows.length) {
  console.log('\n  orphaned headline words (a warning, not a failure):');
  for (const r of orphanRows) console.log(`    ${r.route} @${r.width}  ${r.orphans.join(' | ')}`);
}

for (const width of WIDTHS) {
  const cells = ROUTES.map(
    (route) => `<figure><img src="${pathToFileURL(join(OUT, `${slugOf(route)}-${width}.png`)).href}"><figcaption>${route}</figcaption></figure>`
  ).join('');
  const colW = width >= 1024 ? 150 : 110;
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:white;font:11px/1.3 -apple-system,sans-serif;color:black}h1{font-size:13px;margin:0 0 10px}.grid{display:flex;gap:10px;align-items:flex-start}figure{margin:0;width:${colW}px}img{width:${colW}px;display:block;border:1px solid silver}figcaption{margin-top:4px;word-break:break-all}</style><h1>Every route at ${width}px, full page</h1><div class="grid">${cells}</div>`;
  const file = join(OUT, `sheet-${width}.html`);
  await writeFile(file, html);
  const page = await browser.newPage({ viewport: { width: ROUTES.length * (colW + 10) + 32, height: 900 } });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, `matrix-${width}.png`), fullPage: true });
  await page.close();
}

await browser.close();
await server.close();
console.log(`\n  screenshots: verification/matrix/ (${WIDTHS.length * ROUTES.length}), contact sheets matrix-{375,768,1024,1440}.png`);
console.log(failures ? `\n  RESULT: FAIL (${failures})` : '\n  RESULT: PASS');
process.exit(failures ? 1 : 0);
