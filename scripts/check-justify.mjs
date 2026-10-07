// Justified body text: the guardrails, measured.
//
//   node scripts/check-justify.mjs capture <before|after>
//       Screenshots every paragraph in verification/justify/manifest.json at
//       1440 and 1024.
//   node scripts/check-justify.mjs candidates
//       The same test, run on every paragraph in the manifest with .t-justify
//       added in the page, so a candidate can be measured without editing it.
//   node scripts/check-justify.mjs
//       For every .t-justify paragraph in the build:
//       - the widest word gap on any justified line, as a multiple of the
//         typeface's own space in that paragraph's font, at eight widths from
//         769 to 1920 in Chromium, WebKit and Firefox. Over 2.0 fails: that paragraph goes back
//         to left-aligned.
//       - characters per line at each width; under 55 fails.
//       - at 320, 375 and 768: computed text-align is not justify.
//
// A gap is the visible distance between consecutive word boxes on a line, so it
// is what the browser actually drew; `calibrate` checks the same measure reads
// about 1.0 on left-aligned text. The last line of a paragraph is never
// justified and is skipped.
import { chromium, webkit, firefox } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'justify');
const LIMIT = 2.0;
const MIN_CPL = 55;
const WIDTHS = [769, 850, 1024, 1025, 1100, 1280, 1440, 1920];

const server = await serveDist(join(ROOT, 'dist'), 4620);

// Wait until the justified paragraphs are laid out in their own font. In
// Firefox, document.fonts.ready can resolve before a face is applied, and a
// paragraph measured in the fallback font reads looser than it is.
async function settle(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.querySelectorAll('.t-justify, main p')].map((el) => {
        const cs = getComputedStyle(el);
        return document.fonts.load(`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`);
      })
    );
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}


if (process.argv[2] === 'capture') {
  const label = process.argv[3] || 'after';
  const manifest = JSON.parse(await readFile(join(OUT, 'manifest.json'), 'utf8'));
  await mkdir(join(OUT, label), { recursive: true });
  const browser = await chromium.launch();
  for (const width of [1440, 1024]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    let current = null;
    for (const m of manifest) {
      if (current !== m.route) {
        await page.goto(server.origin + m.route, { waitUntil: 'load' });
        await settle(page);
        current = m.route;
      }
      const clip = await page.evaluate((key) => {
        const el = [...document.querySelectorAll('main p')].find((p) => p.textContent.replace(/\s+/g, ' ').trim().startsWith(key));
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.max(0, r.left - 12), y: r.top + scrollY - 12, width: Math.min(r.width + 24, document.documentElement.clientWidth), height: r.height + 24 };
      }, m.key);
      if (!clip) {
        console.log(`  not found: ${m.route} "${m.key}"`);
        continue;
      }
      await page.screenshot({ path: join(OUT, label, `${m.id}-${width}.png`), clip, fullPage: true });
    }
    await page.close();
  }
  await browser.close();
  await server.close();
  console.log(`captured ${label}: ${join('verification', 'justify', label)}`);
  process.exit(0);
}

// Runs in the page: every paragraph matching `sel`, its widest gap and its
// measure. A gap is the visible distance between two consecutive word boxes on
// one line, so a space that ends a line (which some engines report as running
// to the column edge) never counts. A word hyphenated across a line break is
// two boxes, one on each line.
function measure(sel) {
  const c = document.createElement('canvas').getContext('2d');
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const cs = getComputedStyle(el);
    if (!el.getClientRects().length) continue;
    c.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    // The typeface's own space, before any word-spacing: the reference a
    // reader's eye uses. A tightened base space does not move the yardstick.
    const normal = c.measureText(' ').width;
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    const cpl = el.getBoundingClientRect().width / (c.measureText(text).width / text.length);

    const pieces = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    for (let n; (n = walker.nextNode()); ) {
      const re = /\S+/g;
      let m;
      while ((m = re.exec(n.data))) {
        range.setStart(n, m.index);
        range.setEnd(n, m.index + m[0].length);
        for (const r of range.getClientRects()) if (r.width > 0) pieces.push({ top: r.top, left: r.left, right: r.right });
      }
    }
    // Group into lines by vertical position.
    pieces.sort((p, q) => p.top - q.top || p.left - q.left);
    const lines = [];
    for (const pc of pieces) {
      const line = lines.find((l) => Math.abs(l.top - pc.top) < 3);
      if (line) line.items.push(pc);
      else lines.push({ top: pc.top, items: [pc] });
    }
    lines.sort((p, q) => p.top - q.top);
    let widest = 0;
    let widestLine = 0;
    lines.slice(0, -1).forEach((l, i) => {
      const items = l.items.sort((p, q) => p.left - q.left);
      for (let k = 1; k < items.length; k++) {
        const gap = items[k].left - items[k - 1].right;
        if (gap / normal > widest) {
          widest = gap / normal;
          widestLine = i + 1;
        }
      }
    });
    out.push({
      key: text.slice(0, 44),
      align: cs.textAlign,
      widest,
      widestLine,
      lines: lines.length || 1,
      cpl,
    });
  }
  return out;
}

// Calibration: the same measure on body paragraphs that are not justified must
// read about 1.0, or the numbers below mean nothing.
if (process.argv[2] === 'calibrate') {
  for (const [ename, engine] of [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]]) {
    const browser = await engine.launch();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    let worst = 0;
    let count = 0;
    for (const route of ['/work/kalpay', '/diagnostic', '/about']) {
      await page.goto(server.origin + route, { waitUntil: 'load' });
      await settle(page);
      for (const r of await page.evaluate(measure, 'main p.t-body:not(.t-justify)')) {
        if (r.lines < 2) continue;
        worst = Math.max(worst, r.widest);
        count++;
      }
    }
    console.log(`  ${ename.padEnd(9)} left-aligned control: ${count} paragraphs, widest gap ${worst.toFixed(2)} x normal`);
    await browser.close();
  }
  await server.close();
  process.exit(0);
}

const CANDIDATES = process.argv[2] === 'candidates';
const manifest = CANDIDATES ? JSON.parse(await readFile(join(OUT, 'manifest.json'), 'utf8')) : [];
async function prepare(page, route) {
  if (!CANDIDATES) return;
  const keys = manifest.filter((m) => m.route === route).map((m) => m.key);
  await page.evaluate((keys) => {
    for (const p of document.querySelectorAll('main p')) {
      const t = p.textContent.replace(/\s+/g, ' ').trim();
      if (keys.some((k) => t.startsWith(k))) p.classList.add('t-justify');
    }
  }, keys);
}

const results = new Map();
const failures = [];
const ENGINES = [['chromium', chromium], ['webkit', webkit], ['firefox', firefox]];

for (const [ename, engine] of ENGINES) {
  const browser = await engine.launch();
  const widths = WIDTHS;
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    for (const route of ROUTES) {
      await page.goto(server.origin + route, { waitUntil: 'load' });
      await prepare(page, route);
      await settle(page);
      for (const r of await page.evaluate(measure, '.t-justify')) {
        const id = `${route}|${r.key}`;
        if (!results.has(id)) results.set(id, { route, key: r.key, worst: 0, at: '', minCpl: Infinity, notJustified: [] });
        const x = results.get(id);
        if (r.align !== 'justify') x.notJustified.push(`${ename}@${width}`);
        if (r.widest > x.worst) {
          x.worst = r.widest;
          x.at = `${ename} @${width}, line ${r.widestLine} of ${r.lines}`;
        }
        x.minCpl = Math.min(x.minCpl, r.cpl);
      }
    }
    await page.close();
  }
  await browser.close();
}

// Nothing justified at or below 768.
const small = [];
{
  const browser = await chromium.launch();
  for (const width of [320, 375, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      await page.goto(server.origin + route, { waitUntil: 'load' });
      const n = await page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => getComputedStyle(el).textAlign === 'justify' && el.getClientRects().length).length);
      if (n) small.push(`${route} @${width}: ${n}`);
    }
    await page.close();
  }
  await browser.close();
}
await server.close();

console.log(`JUSTIFIED PARAGRAPHS: widest word gap as a multiple of the typeface's own space (limit ${LIMIT.toFixed(1)}), at ${WIDTHS.join(', ')} in Chromium, WebKit and Firefox`);
console.log('  ' + 'route'.padEnd(40) + 'widest'.padEnd(8) + 'min cpl'.padEnd(9) + 'where'.padEnd(34) + 'paragraph');
let route = '';
for (const r of [...results.values()]) {
  const ok = r.worst <= LIMIT && r.minCpl >= MIN_CPL && r.notJustified.length === 0;
  if (!ok) failures.push(r);
  console.log('  ' + (r.route === route ? '' : r.route).padEnd(40) + r.worst.toFixed(2).padEnd(8) + String(Math.round(r.minCpl)).padEnd(9) + r.at.padEnd(34) + `"${r.key}"${ok ? '' : '  FAIL'}`);
  route = r.route;
}
console.log(`\n  ${results.size} paragraphs carry .t-justify; ${failures.length} fail`);
console.log(`  justified text at 320, 375 or 768: ${small.length ? small.join('; ') : 'none'}`);
const fail = failures.length + small.length;
console.log(fail ? `\nRESULT: FAIL (${fail})` : '\nRESULT: PASS');
process.exit(fail ? 1 : 0);
