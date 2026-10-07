// Motion verification. Three checks, run separately because they fail
// differently.
//
//   nojs     JavaScript disabled. The script never runs, so nothing may be
//            armed: every .m-* element must be in its final state, at 375 and
//            1440. A full-page screenshot of every route is kept as the record.
//   reduced  prefers-reduced-motion. The script runs but must never arm: every
//            .m-* element is final at load, with no scrolling, and no .m-*
//            element carries a transition.
//   motion   Motion on. Walking down each page, every .m-* element must reach
//            its final state within 2s of entering the viewport (15 percent of
//            it, or 15 percent of the viewport for tall elements). Also checks
//            the header: compact after 40px of scroll, inverted over --deep.
//
//   node scripts/check-motion.mjs [nojs|reduced|motion ...]   (default: all)
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, slugOf } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'motion');
const LIMIT_MS = 2000;
const VIEWPORTS = [
  { name: '375', width: 375, height: 812 },
  { name: '1440', width: 1440, height: 900 },
];
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['nojs', 'reduced', 'motion'];

// Runs in the page. Returns every rendered .m-* element with the reason it is
// not yet in its final state, or null when it is.
function mStates() {
  const SEL = '.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image';
  const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
  const clipFinal = (c) => !c || c === 'none' || /^inset\(0(px)?( 0(px)?){0,3}\)$/.test(c);
  const out = [];
  document.querySelectorAll(SEL).forEach((el, index) => {
    if (!el.getClientRects().length) return;
    const cs = getComputedStyle(el);
    let why = null;
    if (cs.visibility === 'hidden') why = 'visibility hidden';
    else if (parseFloat(cs.opacity) < 0.999) why = `opacity ${cs.opacity}`;
    else if (!identity(cs.transform)) why = `transform ${cs.transform}`;
    else if (!clipFinal(cs.clipPath)) why = `clip-path ${cs.clipPath}`;
    else if (
      el.classList.contains('m-count') &&
      el.textContent.trim() !== (el.getAttribute('data-final') || '').trim()
    ) {
      why = `count shows "${el.textContent.trim()}"`;
    } else if (el.classList.contains('m-draw')) {
      for (const p of el.querySelectorAll('path, line, polyline')) {
        if (p.classList.contains('m-node')) continue;
        const pc = getComputedStyle(p);
        if (pc.strokeDasharray !== 'none' && parseFloat(pc.strokeDashoffset) > 0.001) {
          why = `stroke-dashoffset ${pc.strokeDashoffset}`;
          break;
        }
      }
      if (!why) {
        for (const n of el.querySelectorAll('rect, circle, text, .m-node')) {
          if (parseFloat(getComputedStyle(n).opacity) < 0.999) {
            why = 'node not faded in';
            break;
          }
        }
      }
    } else if (el.classList.contains('m-image')) {
      const inner = el.querySelector('.slot-inner');
      if (inner && !identity(getComputedStyle(inner).transform)) why = 'inner block still scaled';
    }
    const b = el.getBoundingClientRect();
    const kind = [...el.classList].find((c) => /^m-(reveal|rule|count|draw|band|image)$/.test(c));
    const durations = cs.transitionDuration.split(',').map((d) => parseFloat(d) * (d.includes('ms') ? 0.001 : 1));
    out.push({
      index,
      kind,
      label: `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]}`,
      why,
      top: b.top,
      bottom: b.bottom,
      height: b.height,
      maxTransition: Math.max(...durations),
    });
  });
  return {
    armed: document.documentElement.classList.contains('m-armed'),
    js: document.documentElement.classList.contains('m-js'),
    states: out,
  };
}

const pad = (s, n) => String(s).padEnd(n);
const server = await serveDist(join(ROOT, 'dist'), 4470);
const browser = await chromium.launch();
let failures = 0;

// ---------------------------------------------------------------- nojs ----
if (modes.includes('nojs')) {
  await mkdir(join(OUT, 'nojs'), { recursive: true });
  console.log('\nA. JAVASCRIPT DISABLED: every .m-* element in its final state');
  console.log('  ' + pad('route', 42) + pad('375: m-* / not final', 24) + pad('1440: m-* / not final', 24) + 'armed');
  const table = new Map();
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp, javaScriptEnabled: false });
    for (const route of ROUTES) {
      const page = await ctx.newPage();
      await page.goto(server.origin + route, { waitUntil: 'load' });
      const r = await page.evaluate(mStates);
      await page.screenshot({ path: join(OUT, 'nojs', `${slugOf(route)}-${vp.name}.png`), fullPage: true });
      await page.close();
      const bad = r.states.filter((s) => s.why);
      if (bad.length || r.armed || r.js) failures++;
      if (!table.has(route)) table.set(route, {});
      table.get(route)[vp.name] = { n: r.states.length, bad, armed: r.armed || r.js };
    }
    await ctx.close();
  }
  for (const [route, t] of table) {
    console.log(
      '  ' +
        pad(route, 42) +
        pad(`${t['375'].n} / ${t['375'].bad.length}`, 24) +
        pad(`${t['1440'].n} / ${t['1440'].bad.length}`, 24) +
        (t['375'].armed || t['1440'].armed ? 'YES' : 'no')
    );
    for (const w of ['375', '1440']) for (const b of t[w].bad.slice(0, 3)) console.log(`      @${w} ${b.label}: ${b.why}`);
  }
  console.log(`  screenshots: verification/motion/nojs/ (${ROUTES.length * VIEWPORTS.length})`);
}

// ------------------------------------------------------------- reduced ----
if (modes.includes('reduced')) {
  console.log('\nB. PREFERS-REDUCED-MOTION: script runs, never arms, everything final at load, no transitions');
  console.log('  ' + pad('route', 42) + pad('375: not final / transitions', 30) + pad('1440: not final / transitions', 31) + 'script ran / armed');
  for (const route of ROUTES) {
    const cells = [];
    let ran = true;
    let armed = false;
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: vp, reducedMotion: 'reduce' });
      const page = await ctx.newPage();
      await page.goto(server.origin + route, { waitUntil: 'load' });
      const r = await page.evaluate(mStates);
      await ctx.close();
      const notFinal = r.states.filter((s) => s.why).length;
      const moving = r.states.filter((s) => s.maxTransition > 0.01).length;
      ran = ran && r.js;
      armed = armed || r.armed;
      if (notFinal || moving) failures++;
      cells.push(`${notFinal} / ${moving}`);
    }
    if (!ran || armed) failures++;
    console.log('  ' + pad(route, 42) + pad(cells[0], 30) + pad(cells[1], 31) + `${ran ? 'yes' : 'NO'} / ${armed ? 'YES' : 'no'}`);
  }
}

// -------------------------------------------------------------- motion ----
async function walk(ctx, route, vp) {
  const page = await ctx.newPage();
  await page.goto(server.origin + route, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);

  const total = await page.evaluate(() => document.documentElement.scrollHeight);
  const reached = new Map();
  const late = new Map();
  let armed = false;

  for (let y = 0; ; y += Math.round(vp.height * 0.8)) {
    const target = Math.min(y, Math.max(0, total - vp.height));
    await page.evaluate((t) => window.scrollTo(0, t), target);
    const t0 = Date.now();
    for (;;) {
      const r = await page.evaluate(mStates);
      armed = armed || r.armed;
      const now = Date.now() - t0;
      let waiting = 0;
      for (const s of r.states) {
        if (reached.has(s.index)) continue;
        const visible = Math.min(s.bottom, vp.height) - Math.max(s.top, 0);
        const entered = visible > 0 && (visible / s.height >= 0.15 || visible >= vp.height * 0.15);
        if (!entered) continue;
        if (!s.why) {
          reached.set(s.index, now);
          late.delete(s.index);
        } else {
          waiting++;
          late.set(s.index, `${s.label}: ${s.why}`);
        }
      }
      if (!waiting || now > 3000) break;
      await new Promise((res) => setTimeout(res, 50));
    }
    if (target >= total - vp.height) break;
  }

  const count = await page.evaluate(() => document.querySelectorAll('.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image').length);
  await page.close();
  const times = [...reached.values()];
  return {
    route,
    armed,
    tracked: reached.size + late.size,
    count,
    max: times.length ? Math.max(...times) : 0,
    over: times.filter((t) => t > LIMIT_MS).length + late.size,
    late: [...late.values()],
  };
}

if (modes.includes('motion')) {
  console.log(`\nC. MOTION ON: every .m-* element final within ${LIMIT_MS}ms of entering the viewport`);
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: vp });
    const results = [];
    for (let i = 0; i < ROUTES.length; i += 4) {
      results.push(...(await Promise.all(ROUTES.slice(i, i + 4).map((r) => walk(ctx, r, vp)))));
    }
    console.log(`\n  @${vp.name}px`);
    console.log('  ' + pad('route', 42) + pad('m-* measured', 14) + pad('slowest', 10) + pad(`over ${LIMIT_MS}ms`, 13) + 'armed');
    for (const r of results) {
      if (r.over || !r.armed) failures++;
      console.log('  ' + pad(r.route, 42) + pad(r.tracked, 14) + pad(`${r.max}ms`, 10) + pad(r.over, 13) + (r.armed ? 'yes' : 'NO'));
      for (const l of r.late.slice(0, 3)) console.log(`      ${l}`);
    }

    if (vp.name === '1440') {
      const page = await ctx.newPage();
      await page.goto(server.origin + '/', { waitUntil: 'load' });
      const h = () => page.evaluate(() => Math.round(document.querySelector('[data-hdr]').getBoundingClientRect().height));
      const top = await h();
      await page.evaluate(() => window.scrollTo(0, 120));
      await page.waitForTimeout(400);
      const compact = await h();
      const workTop = await page.evaluate(() => document.querySelector('#work').getBoundingClientRect().top + scrollY);
      await page.evaluate((t) => window.scrollTo(0, t + 40), workTop);
      await page.waitForTimeout(300);
      const over = await page.evaluate(() => document.querySelector('[data-hdr]').getAttribute('data-over'));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const back = await h();
      await page.close();
      const ok = top === 88 && compact === 72 && back === 88 && over === 'dark';
      if (!ok) failures++;
      console.log(`\n  header @1440: top ${top}px, after 120px of scroll ${compact}px, back at top ${back}px; over the Selected Work band: data-over="${over}"  ${ok ? 'PASS' : 'FAIL'}`);
    }
    await ctx.close();
  }
}

await browser.close();
await server.close();
console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
