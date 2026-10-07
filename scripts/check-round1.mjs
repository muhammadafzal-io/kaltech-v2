// Review round 1: verification of the sixteen redesigned sections.
//
//   A  JavaScript off: every new visual renders complete and static.
//   B  Reduced motion: every new visual in its final state, no transitions.
//   C  320 and 375: no horizontal scroll on any route, no text inside a new
//      visual below 12px, timeline labels stacked below 768.
//   D  FitCheck by keyboard only, both pages: tick and untick every item.
//   E  Words and names: the approved new labels render where they should, the
//      gated ones do not, and none of the nine unverified client names is
//      anywhere in the build.
//   F  Placeholders: counts before (the 16 September build, `dist 2`) and
//      after, per route.
//   G  Before and after, side by side, for all sixteen sections.
//   H  Contrast inside every new visual: each text colour against the ground
//      it sits on, SVG labels included at their rendered size, plus the
//      non-text contrast of the new controls (WCAG 1.4.11, 3:1).
//
// Screenshots and sheets go to verification/round1/.
import { chromium } from 'playwright';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveDist } from './serve.mjs';
import { SECTIONS } from './review-sections.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'round1');
for (const d of ['nojs', 'reduced', 'sheets']) await mkdir(join(OUT, d), { recursive: true });

const VISUALS = [
  ['Home: diagnostic fork', '/', '.fork'],
  ['Work: case index', '/work', '.caseidx'],
  ['Work: sketch, KalPay', '/work', '#kalpay .sk'],
  ['Work: sketch, AHW Global', '/work', '#ahw-global .sk'],
  ['Work: sketch, BECS', '/work', '#becs .sk'],
  ['Services: routing', '/services', '.route'],
  ['Services: card 01', '/services', '.serviceline:nth-child(1) .sl-card'],
  ['Services: card 02', '/services', '.serviceline:nth-child(2) .sl-card'],
  ['Services: card 03', '/services', '.serviceline:nth-child(3) .sl-card'],
  ['Services: engagement timeline', '/services', '.svc-engage-tl'],
  ['Services: fit check', '/services', '#fit-services'],
  ['Diagnostic: incentive bars', '/diagnostic', '.dx-why-table'],
  ['Diagnostic: lens gate', '/diagnostic', '.lgate'],
  ['Diagnostic: lens 01', '/diagnostic', '.lens:nth-child(3) .lensd'],
  ['Diagnostic: lens 02', '/diagnostic', '.lens:nth-child(4) .lensd'],
  ['Diagnostic: lens 03', '/diagnostic', '.lens:nth-child(5) .lensd'],
  ['Diagnostic: phase timeline', '/diagnostic', '.dx-runs-tl'],
  ['Diagnostic: facsimile', '/diagnostic', '.dxr-facs'],
  ['Diagnostic: fit check', '/diagnostic', '#fit-diagnostic'],
  ['About: org shape', '/about', '.org'],
  ['About: not counted', '/about', '.ab-nc'],
  ['About: footprint map', '/about', '.wmap'],
  ['About: closing band', '/about', '#cta'],
];

// Runs in the page: is everything inside this visual in its final state?
function finalState(root) {
  const SEL = '.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image';
  const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
  const clipFinal = (c) => !c || c === 'none' || /^inset\(0(px)?( 0(px)?){0,3}\)$/.test(c);
  const shown = (el) => el.getClientRects().length > 0;
  const bad = [];
  for (const el of [root, ...root.querySelectorAll(SEL)].filter((e) => e.matches(SEL) && shown(e))) {
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.999 || !identity(cs.transform) || !clipFinal(cs.clipPath))
      bad.push((el.getAttribute('class') || el.tagName).split(' ')[0]);
  }
  let strokes = 0;
  let undrawn = 0;
  for (const p of root.querySelectorAll('svg path, svg line, svg polyline')) {
    if (!shown(p.ownerSVGElement)) continue;
    strokes++;
    const cs = getComputedStyle(p);
    const dashed = cs.strokeDasharray !== 'none' && !p.classList.contains('m-node');
    if (parseFloat(cs.opacity) < 0.999 || (dashed && Math.abs(parseFloat(cs.strokeDashoffset)) > 0.001)) undrawn++;
  }
  let slowest = 0;
  for (const el of [root, ...root.querySelectorAll('*')]) {
    const durs = getComputedStyle(el).transitionDuration.split(',').map((d) => parseFloat(d) * (d.includes('ms') ? 1 : 1000));
    slowest = Math.max(slowest, ...durs);
  }
  return { notFinal: bad, strokes, undrawn, slowestTransitionMs: slowest };
}

// Runs in the page: smallest rendered text inside a visual, SVG text included.
function smallestText(root) {
  let min = Infinity;
  let where = '';
  const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
  for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!own(el) || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    let size = parseFloat(cs.fontSize);
    if (el instanceof SVGElement) {
      const svg = el.ownerSVGElement;
      const vb = svg.viewBox.baseVal;
      if (vb && vb.width) size *= svg.getBoundingClientRect().width / vb.width;
    }
    if (size < min) {
      min = size;
      where = `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}"`;
    }
  }
  return { min: Math.round(min * 10) / 10, where };
}

const server = await serveDist(join(ROOT, 'dist'), 4580);
const browser = await chromium.launch();
let failures = 0;

async function shoot(ctx, route, sel, path) {
  const page = await ctx.newPage();
  await page.goto(server.origin + route, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const el = page.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  const state = await el.evaluate(finalState);
  await el.screenshot({ path });
  await page.close();
  return state;
}

// ---- A. JavaScript off ------------------------------------------------------
console.log('A. JAVASCRIPT OFF: every new visual complete and static, 1440');
console.log('  ' + 'visual'.padEnd(34) + 'not final'.padEnd(11) + 'strokes drawn'.padEnd(15) + 'result');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  for (let i = 0; i < VISUALS.length; i++) {
    const [name, route, sel] = VISUALS[i];
    const s = await shoot(ctx, route, sel, join(OUT, 'nojs', `${String(i + 1).padStart(2, '0')}.png`));
    const ok = s.notFinal.length === 0 && s.undrawn === 0;
    if (!ok) failures++;
    console.log('  ' + name.padEnd(34) + String(s.notFinal.length).padEnd(11) + (s.strokes ? `${s.strokes - s.undrawn} / ${s.strokes}` : '-').padEnd(15) + (ok ? 'PASS' : 'FAIL'));
  }
  // The fit check without JavaScript is the plain list.
  const page = await ctx.newPage();
  for (const [route, id] of [['/services', '#fit-services'], ['/diagnostic', '#fit-diagnostic']]) {
    await page.goto(server.origin + route, { waitUntil: 'load' });
    const f = await page.evaluate((id) => {
      const root = document.querySelector(id);
      const vis = (el) => el && getComputedStyle(el).display !== 'none';
      return {
        items: root.querySelectorAll('.fit-text').length,
        boxes: [...root.querySelectorAll('.fit-box')].filter(vis).length,
        side: vis(root.querySelector('.fit-side')),
      };
    }, id);
    const ok = f.items > 0 && f.boxes === 0 && !f.side;
    if (!ok) failures++;
    console.log(`  ${route} fit check without JS: ${f.items} statements listed, ${f.boxes} checkboxes shown, meter and button ${f.side ? 'shown' : 'absent'}  ${ok ? 'PASS' : 'FAIL'}`);
  }
  await page.close();
  await ctx.close();
}

// ---- B. Reduced motion -------------------------------------------------------
console.log('\nB. REDUCED MOTION: final state at load, no transitions, 1440');
console.log('  ' + 'visual'.padEnd(34) + 'not final'.padEnd(11) + 'strokes drawn'.padEnd(15) + 'slowest transition'.padEnd(20) + 'result');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  for (let i = 0; i < VISUALS.length; i++) {
    const [name, route, sel] = VISUALS[i];
    const s = await shoot(ctx, route, sel, join(OUT, 'reduced', `${String(i + 1).padStart(2, '0')}.png`));
    const ok = s.notFinal.length === 0 && s.undrawn === 0 && s.slowestTransitionMs <= 0.01;
    if (!ok) failures++;
    console.log('  ' + name.padEnd(34) + String(s.notFinal.length).padEnd(11) + (s.strokes ? `${s.strokes - s.undrawn} / ${s.strokes}` : '-').padEnd(15) + `${s.slowestTransitionMs.toFixed(3)}ms`.padEnd(20) + (ok ? 'PASS' : 'FAIL'));
  }
  const page = await ctx.newPage();
  await page.goto(server.origin + '/', { waitUntil: 'load' });
  const armed = await page.evaluate(() => document.documentElement.classList.contains('m-armed'));
  if (armed) failures++;
  console.log(`  motion armed under reduced motion: ${armed ? 'yes  FAIL' : 'no  PASS'}`);
  await page.close();
  await ctx.close();
}

// ---- C. Small widths --------------------------------------------------------
console.log('\nC. SMALL WIDTHS: horizontal scroll per route, smallest text inside each new visual');
for (const width of [320, 375]) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const scroll = [];
  for (const route of ROUTES) {
    await page.goto(server.origin + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const w = await page.evaluate(() => document.documentElement.scrollWidth);
    if (w > width) {
      scroll.push(`${route} ${w}px`);
      failures++;
    }
  }
  console.log(`  ${width}px  horizontal scroll: ${scroll.length ? scroll.join(', ') : `none on ${ROUTES.length} routes`}`);
  const small = [];
  let floor = Infinity;
  for (const [name, route, sel] of VISUALS) {
    await page.goto(server.origin + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const r = await page.locator(sel).first().evaluate(smallestText);
    floor = Math.min(floor, r.min);
    if (r.min < 12) {
      small.push(`${name}: ${r.min}px ${r.where}`);
      failures++;
    }
  }
  console.log(`  ${width}px  smallest text in any new visual: ${floor}px${small.length ? '  FAIL\n      ' + small.join('\n      ') : '  PASS'}`);
  // Timelines stack their labels rather than shrink them.
  await page.goto(server.origin + '/services', { waitUntil: 'load' });
  const cols = await page.evaluate(() => [...document.querySelectorAll('.tl-cells')].map((c) => getComputedStyle(c).gridTemplateColumns.split(' ').length));
  const stacked = cols.every((n) => n === 1);
  if (!stacked) failures++;
  console.log(`  ${width}px  timeline labels: ${stacked ? 'stacked, one column' : `columns ${cols.join(', ')}  FAIL`}`);
  await ctx.close();
}

// ---- D. FitCheck by keyboard ----------------------------------------------
console.log('\nD. FIT CHECK, keyboard only: Tab to the list, Space to tick every item, then Shift+Tab back unticking each');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  for (const [route, id] of [['/services', '#fit-services'], ['/diagnostic', '#fit-diagnostic']]) {
    const page = await ctx.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    const state = () =>
      page.evaluate((id) => {
        const root = document.querySelector(id);
        const a = document.activeElement;
        const cs = a ? getComputedStyle(a) : null;
        return {
          n: Number(root.querySelector('[data-fit-n]').textContent),
          on: root.querySelectorAll('.mc-seg.is-on').length,
          ticked: root.querySelectorAll('.fit-box:checked').length,
          open: root.querySelector('[data-fit-cta]').classList.contains('is-open'),
          ctaVisible: getComputedStyle(root.querySelector('[data-fit-cta]')).visibility === 'visible',
          focusIsBox: !!a && a.classList.contains('fit-box') && root.contains(a),
          focusIsCta: !!a && a.closest('[data-fit-cta]') !== null && root.contains(a),
          ring: cs ? `${cs.outlineStyle} ${cs.outlineWidth}` : '',
        };
      }, id);
    // Tab from the top of the page until the first box has focus.
    let tabs = 0;
    for (; tabs < 200; tabs++) {
      await page.keyboard.press('Tab');
      if ((await state()).focusIsBox) break;
    }
    const total = await page.evaluate((id) => document.querySelectorAll(`${id} .fit-box`).length, id);
    const need = total - 1;
    const steps = [];
    let ok = true;
    for (let i = 1; i <= total; i++) {
      await page.keyboard.press('Space');
      const s = await state();
      const expectOpen = i >= need;
      const stepOk = s.n === i && s.on === i && s.ticked === i && s.open === expectOpen && s.ctaVisible === expectOpen && s.focusIsBox && /solid 2px/.test(s.ring);
      ok = ok && stepOk;
      steps.push(`${i}${s.open ? '*' : ''}`);
      if (i < total) await page.keyboard.press('Tab');
    }
    // One more Tab: with the button open, focus lands on it.
    await page.keyboard.press('Tab');
    const afterLast = await state();
    ok = ok && afterLast.focusIsCta;
    await page.keyboard.press('Shift+Tab');
    const back = [];
    for (let i = total - 1; i >= 0; i--) {
      await page.keyboard.press('Space');
      const s = await state();
      const expectOpen = i >= need;
      const stepOk = s.n === i && s.on === i && s.open === expectOpen && s.focusIsBox;
      ok = ok && stepOk;
      back.push(`${i}${s.open ? '*' : ''}`);
      if (i > 0) await page.keyboard.press('Shift+Tab');
    }
    // With nothing ticked the button is hidden and out of the tab order.
    for (let i = 1; i < total; i++) await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const hiddenSkip = await state();
    ok = ok && !hiddenSkip.focusIsCta;
    if (!ok) failures++;
    console.log(`  ${route}  ${tabs + 1} Tabs to reach the first box; ${total} items, button at ${need}`);
    console.log(`      ticking   n = ${steps.join(' ')}   (* = button open)`);
    console.log(`      button takes focus after the last box when open: ${afterLast.focusIsCta ? 'yes' : 'no'}`);
    console.log(`      unticking n = ${back.join(' ')}`);
    console.log(`      button skipped by Tab while hidden: ${hiddenSkip.focusIsCta ? 'no' : 'yes'}; focus ring on each box: ${steps.length ? 'solid 2px' : '-'}   ${ok ? 'PASS' : 'FAIL'}`);
    await page.screenshot({ path: join(OUT, `fitcheck-${route.slice(1)}-keyboard.png`) });
    await page.close();
  }
  await ctx.close();
}

// ---- E. Words and names ---------------------------------------------------
console.log('\nE. WORDS AND NAMES');
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const text = {};
  for (const route of ROUTES) {
    await page.goto(server.origin + route, { waitUntil: 'load' });
    text[route] = await page.evaluate(() => document.body.innerText);
  }
  const count = (route, s) => text[route].split(s).length - 1;
  const expect = [
    ['/', 'Nothing built', 1],
    ['/', 'The binding constraint', 1],
    ['/', 'What it costs', 1],
    ['/', 'What can be built', 1],
    ['/', 'The P&L line and the volume', 1],
    ['/work', 'Illustrative interface', 3],
    ['/work', 'Agent console', 1],
    ['/work', 'Shipment', 1],
    ['/work', 'Component inventory', 1],
    ['/services', 'Illustrative proportions', 4],
    ['/services', 'First conversation', 1],
    ['/diagnostic', 'Illustrative proportions', 1],
    ['/diagnostic', 'System A', 1],
    ['/diagnostic', 'System B', 1],
    ['/diagnostic', '1,204', 1],
    ['/diagnostic', '1,187', 1],
    ['/about', 'Illustrative', 1],
    ['/about', 'Working hours', 0],
    ['/about', 'UTC', 0],
    ['/about', 'US East', 0],
  ];
  for (const [route, s, n] of expect) {
    // Case-insensitive where the label is set in capitals by CSS.
    const got = text[route].toLowerCase().split(s.toLowerCase()).length - 1;
    const ok = n === 0 ? got === 0 : got >= n;
    if (!ok) failures++;
    console.log(`  ${route.padEnd(12)} "${s}"`.padEnd(52) + `${got} rendered, expected ${n === 0 ? 'none' : n}  ${ok ? 'PASS' : 'FAIL'}`);
  }
  const nine = ['Meridian', 'Northcote', 'Vantor', 'Helix & Co', 'Arlowe', 'Sabre Freight', 'Ostium', 'Caldera', 'Wren Systems'];
  let found = 0;
  const walk = async (dir, out = []) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, out);
      else if (/\.(html|css|js|json|xml|txt)$/.test(e.name)) out.push(p);
    }
    return out;
  };
  for (const f of await walk(join(ROOT, 'dist'))) {
    const s = (await readFile(f, 'utf8')).replace(/&amp;/g, '&');
    for (const n of nine) if (s.includes(n)) found++;
  }
  if (found) failures++;
  console.log(`  the nine unverified client names anywhere in dist/: ${found}  ${found ? 'FAIL' : 'PASS'}`);
  await ctx.close();
}

// ---- F. Placeholders ------------------------------------------------------
console.log('\nF. PLACEHOLDERS RENDERED, per route: before (dist 2, 16 September) and after');
{
  const count = async (dir) => {
    const out = {};
    for (const route of ROUTES) {
      const f = join(dir, route === '/' ? 'index.html' : route.slice(1), route === '/' ? '' : 'index.html');
      try {
        out[route] = (await readFile(f, 'utf8')).split('[PLACEHOLDER]').length - 1;
      } catch {
        out[route] = null;
      }
    }
    return out;
  };
  const before = await count(join(ROOT, 'dist 2'));
  const after = await count(join(ROOT, 'dist'));
  let tb = 0;
  let ta = 0;
  for (const route of ROUTES) {
    tb += before[route] ?? 0;
    ta += after[route] ?? 0;
    const d = (after[route] ?? 0) - (before[route] ?? 0);
    console.log(`  ${route.padEnd(42)} ${String(before[route]).padStart(3)} → ${String(after[route]).padStart(3)}${d ? `   ${d > 0 ? '+' : ''}${d}` : ''}`);
  }
  console.log(`  ${'total'.padEnd(42)} ${String(tb).padStart(3)} → ${String(ta).padStart(3)}`);
}

// ---- G. Before and after -------------------------------------------------
console.log('\nG. BEFORE AND AFTER, all sixteen sections at 1440 and 375');
{
  const cells = [];
  for (const s of SECTIONS) {
    const src = (label, w) => pathToFileURL(join(OUT, label, `${s.id}-${w}.png`)).href;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;padding:16px;background:white;font:12px/1.3 -apple-system,sans-serif;color:black}
      h1{font-size:14px;margin:0 0 10px}
      .row{display:flex;gap:16px;align-items:flex-start;margin-bottom:16px}
      figure{margin:0}
      figcaption{margin-bottom:4px;font-weight:600}
      .w1440 img{width:700px;display:block;border:1px solid silver}
      .w375 img{width:300px;display:block;border:1px solid silver}
    </style>
    <h1>${s.id} — before | after</h1>
    <div class="row w1440"><figure><figcaption>Before, 1440</figcaption><img src="${src('before', 1440)}"></figure><figure><figcaption>After, 1440</figcaption><img src="${src('after', 1440)}"></figure></div>
    <div class="row w375"><figure><figcaption>Before, 375</figcaption><img src="${src('before', 375)}"></figure><figure><figcaption>After, 375</figcaption><img src="${src('after', 375)}"></figure></div>`;
    const file = join(OUT, 'sheets', `${s.id}.html`);
    await writeFile(file, html);
    const page = await browser.newPage({ viewport: { width: 1450, height: 900 } });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.screenshot({ path: join(OUT, 'sheets', `${s.id}.png`), fullPage: true });
    await page.close();
    cells.push(s.id);
  }
  console.log(`  ${cells.length} sheets: verification/round1/sheets/<section>.png`);

  // Contact sheets for A and B.
  for (const mode of ['nojs', 'reduced']) {
    const figs = VISUALS.map(([name], i) => `<figure><figcaption>${String(i + 1).padStart(2, '0')} ${name}</figcaption><img src="${pathToFileURL(join(OUT, mode, `${String(i + 1).padStart(2, '0')}.png`)).href}"></figure>`).join('');
    const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;background:white;font:12px/1.3 -apple-system,sans-serif;color:black}h1{font-size:14px;margin:0 0 12px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}figure{margin:0}figcaption{margin-bottom:4px;font-weight:600}img{width:100%;display:block;border:1px solid silver}</style><h1>${mode === 'nojs' ? 'JavaScript disabled' : 'prefers-reduced-motion: reduce'} — every new visual, 1440</h1><div class="grid">${figs}</div>`;
    const file = join(OUT, `${mode}-sheet.html`);
    await writeFile(file, html);
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
    await page.screenshot({ path: join(OUT, `${mode}-sheet.png`), fullPage: true });
    await page.close();
  }
  console.log('  contact sheets: verification/round1/nojs-sheet.png, reduced-sheet.png');
}

// ---- H. Contrast inside the new visuals ---------------------------------
console.log('\nH. CONTRAST inside every new visual, 375 and 1440 (text against its ground; SVG labels at rendered size)');
{
  const parse = (c) => {
    const n = (c.match(/[\d.]+/g) || []).map(Number);
    return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n.length > 3 ? n[3] : 1 };
  };
  const over = (fg, bg, a = fg.a) => ({ r: fg.r * a + bg.r * (1 - a), g: fg.g * a + bg.g * (1 - a), b: fg.b * a + bg.b * (1 - a), a: 1 });
  const lum = (c) => {
    const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const pairs = new Map();
  for (const width of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    for (const [name, route, sel] of VISUALS) {
      await page.goto(server.origin + route, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const found = await page.locator(sel).first().evaluate((root) => {
        const out = [];
        const own = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
        const grounds = (el) => {
          const gs = [];
          let op = 1;
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const cs = getComputedStyle(n);
            op *= parseFloat(cs.opacity);
            const a = (cs.backgroundColor.match(/[\d.]+/g) || []);
            if (a.length < 4 || parseFloat(a[3]) > 0) gs.push(cs.backgroundColor);
          }
          gs.push(getComputedStyle(document.body).backgroundColor);
          return { gs, op };
        };
        for (const el of [root, ...root.querySelectorAll('*')]) {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || !el.getClientRects().length) continue;
          const svgText = el instanceof SVGElement && el.tagName.toLowerCase() === 'text';
          if (el instanceof SVGElement && !svgText) continue;
          if (!own(el)) continue;
          let size = parseFloat(cs.fontSize);
          if (svgText) {
            const vb = el.ownerSVGElement.viewBox.baseVal;
            if (vb && vb.width) size *= el.ownerSVGElement.getBoundingClientRect().width / vb.width;
          }
          const { gs, op } = grounds(el);
          out.push({ kind: 'text', color: svgText ? cs.fill : cs.color, gs, op, size, weight: parseInt(cs.fontWeight, 10) || 400, what: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]} "${el.textContent.trim().slice(0, 22)}"` });
        }
        // Non-text: the checkbox edge, the meter's empty segment, the map's delivery marker.
        for (const [q, prop, label] of [['.fit-box', 'borderTopColor', 'checkbox edge'], ['.mc-seg:not(.is-on)', 'borderTopColor', 'meter segment edge'], ['.wmap-delivery .wmap-sq', 'backgroundColor', 'delivery marker'], ['.wmap-operating .wmap-sq', 'backgroundColor', 'operating marker']]) {
          const el = root.querySelector(q);
          if (!el || !el.getClientRects().length || getComputedStyle(el).display === 'none') continue;
          const { gs } = grounds(el.parentElement);
          out.push({ kind: 'ui', color: getComputedStyle(el)[prop], gs, op: 1, size: 0, weight: 0, what: label });
        }
        return out;
      });
      for (const f of found) {
        let ground = { r: 255, g: 255, b: 255, a: 1 };
        for (const g of [...f.gs].reverse()) ground = over(parse(g), ground);
        const fg = over(parse(f.color), ground, parse(f.color).a * f.op);
        const large = f.kind === 'text' && (f.size >= 24 || (f.size >= 18.66 && f.weight >= 700));
        const need = f.kind === 'ui' ? 3 : large ? 3 : 4.5;
        const key = `${f.kind}|${hex(fg)}|${hex(ground)}|${need}`;
        const r = ratio(fg, ground);
        const prev = pairs.get(key);
        if (!prev) pairs.set(key, { kind: f.kind, fg: hex(fg), bg: hex(ground), need, r, min: f.size, max: f.size, where: `${name}: ${f.what}`, n: 1 });
        else {
          prev.n++;
          prev.min = Math.min(prev.min, f.size);
          prev.max = Math.max(prev.max, f.size);
        }
      }
    }
    await ctx.close();
  }
  const rows = [...pairs.values()].sort((a, b) => a.r - b.r);
  console.log('  ' + 'kind'.padEnd(6) + 'colour'.padEnd(9) + 'ground'.padEnd(9) + 'sizes'.padEnd(12) + 'ratio'.padEnd(8) + 'need'.padEnd(6) + 'result  example');
  let low = 0;
  for (const r of rows) {
    const ok = r.r >= r.need;
    if (!ok) low++;
    const sizes = r.kind === 'ui' ? '-' : r.min === r.max ? `${r.min.toFixed(0)}px` : `${r.min.toFixed(0)}–${r.max.toFixed(0)}px`;
    console.log('  ' + r.kind.padEnd(6) + r.fg.padEnd(9) + r.bg.padEnd(9) + sizes.padEnd(12) + r.r.toFixed(2).padEnd(8) + String(r.need).padEnd(6) + (ok ? 'pass    ' : 'FAIL    ') + r.where);
  }
  if (low) failures += low;
  console.log(`  ${rows.length} distinct pairings inside the new visuals; below requirement: ${low}`);
}

await browser.close();
await server.close();
console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
