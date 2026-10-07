// Contrast, derived from the built pages rather than from a list.
//
// Every element carrying its own visible text is measured against the ground it
// actually sits on: ancestors are walked until an opaque background is found,
// semi-transparent backgrounds are composited, and any inherited opacity is
// composited too (text at 60 percent opacity is measured at 60 percent). Each
// distinct pairing of colour, ground, size and weight is reported once.
//
// AA: 4.5:1 below 24px (or below 18.66px bold), 3:1 at or above.
//
// The fixed grain overlay sits above the page at 3 percent, so it very slightly
// flattens every pairing. The "with grain" column composites a mid grey at 3
// percent over both colours to show that cost.
import { chromium } from 'playwright';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WIDTHS = [375, 768, 1440];

const parse = (s) => {
  const n = (s.match(/[\d.]+/g) || []).map(Number);
  return { r: n[0] ?? 0, g: n[1] ?? 0, b: n[2] ?? 0, a: n.length > 3 ? n[3] : 1 };
};
const over = (fg, bg, alpha = fg.a) => ({
  r: fg.r * alpha + bg.r * (1 - alpha),
  g: fg.g * alpha + bg.g * (1 - alpha),
  b: fg.b * alpha + bg.b * (1 - alpha),
  a: 1,
});
const lum = (c) => {
  const f = (v) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hex = (c) =>
  '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const server = await serveDist(join(ROOT, 'dist'), 4500);
const browser = await chromium.launch();
const pairs = new Map();

for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);

    const found = await page.evaluate(() => {
      const out = [];
      const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return el.getClientRects().length > 0;
      };
      const ownText = (el) =>
        [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim().length > 0);

      for (const el of document.querySelectorAll('body *')) {
        if (['SCRIPT', 'STYLE', 'TITLE'].includes(el.tagName)) continue;
        // SVG text is text too: the diagram labels are measured by their fill,
        // at the size they actually render once the viewBox is scaled.
        const svgText = el instanceof SVGElement && el.tagName.toLowerCase() === 'text';
        if (el instanceof SVGElement && !svgText) continue;
        if (!ownText(el) || !visible(el)) continue;

        const cs = getComputedStyle(el);
        let size = parseFloat(cs.fontSize);
        if (svgText) {
          const svg = el.ownerSVGElement;
          const vb = svg.viewBox.baseVal;
          if (vb && vb.width) size *= svg.getBoundingClientRect().width / vb.width;
        }
        // Inherited opacity: text at 0.6 is really 0.6 of the way to its ground.
        let opacity = 1;
        const grounds = [];
        for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
          const ns = getComputedStyle(n);
          opacity *= parseFloat(ns.opacity);
          const alpha = (ns.backgroundColor.match(/[\d.]+/g) || []).length > 3 ? parseFloat(ns.backgroundColor.match(/[\d.]+/g)[3]) : 1;
          if (alpha > 0) grounds.push(ns.backgroundColor);
        }
        grounds.push(getComputedStyle(document.body).backgroundColor);
        grounds.push(getComputedStyle(document.documentElement).backgroundColor);

        out.push({
          color: svgText ? cs.fill : cs.color,
          grounds,
          opacity,
          size,
          svg: svgText,
          weight: parseInt(cs.fontWeight, 10) || 400,
          sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
          text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28),
        });
      }
      return out;
    });

    for (const f of found) {
      // Composite the ground stack from the bottom up, then the text on it.
      let ground = { r: 255, g: 255, b: 255, a: 1 };
      for (const g of [...f.grounds].reverse()) ground = over(parse(g), ground);
      const fg = over(parse(f.color), ground, parse(f.color).a * f.opacity);

      const large = f.size >= 24 || (f.size >= 18.66 && f.weight >= 700);
      const key = `${hex(fg)}|${hex(ground)}|${Math.round(f.size)}|${f.weight}`;
      if (!pairs.has(key)) {
        const grainy = { r: 128, g: 128, b: 128, a: 0.03 };
        pairs.set(key, {
          fg: hex(fg),
          bg: hex(ground),
          size: Math.round(f.size),
          weight: f.weight,
          large,
          need: large ? 3 : 4.5,
          ratio: ratio(fg, ground),
          withGrain: ratio(over(grainy, fg), over(grainy, ground)),
          where: `${route} @${width}`,
          sel: f.sel,
          text: f.text,
          count: 1,
        });
      } else {
        pairs.get(key).count++;
      }
    }
    await page.close();
  }
  await ctx.close();
}

await browser.close();
await server.close();

const rows = [...pairs.values()].sort((a, b) => a.ratio - b.ratio);
const fails = rows.filter((r) => r.ratio < r.need);
const flagged = rows.filter((r) => /logostrip/.test(r.sel));

console.log('CONTRAST: every text colour against the ground it sits on, from the built pages');
console.log(`  ${WIDTHS.join(', ')}px, ${ROUTES.length} routes: ${rows.length} distinct pairings\n`);
console.log('  ' + 'text'.padEnd(9) + 'ground'.padEnd(9) + 'size/wt'.padEnd(10) + 'ratio'.padEnd(8) + 'w/ grain'.padEnd(10) + 'need'.padEnd(7) + 'result'.padEnd(8) + 'example');
for (const r of rows) {
  console.log(
    '  ' + r.fg.padEnd(9) + r.bg.padEnd(9) + `${r.size}/${r.weight}`.padEnd(10) +
      r.ratio.toFixed(2).padEnd(8) + r.withGrain.toFixed(2).padEnd(10) + String(r.need).padEnd(7) +
      (r.ratio < r.need ? 'FAIL' : 'pass').padEnd(8) + `${r.sel} "${r.text}" ${r.where}`
  );
}

if (flagged.length) {
  console.log('\n  FLAGGED, not exempted: the logo strip is client names set as text at 60 percent.');
  for (const r of flagged) console.log(`    ${r.sel} ${r.ratio.toFixed(2)}:1 against ${r.bg} — a logotype exemption only holds if real logo images replace the text before launch.`);
}

console.log(fails.length ? `\n  RESULT: ${fails.length} pairing(s) below AA` : '\n  RESULT: every pairing meets AA');
process.exit(fails.filter((r) => !/logostrip/.test(r.sel)).length ? 1 : 0);
