// Phase 3 device verification, at 1440.
//
// For every per-page device: a JavaScript-disabled screenshot and a
// JavaScript-enabled screenshot taken 2s after the device is scrolled into
// view, plus the checks behind them:
//   - JS off: every .m-* element inside the device is in its final state, and
//     nothing inside it is fully clipped.
//   - SVG devices: every drawn stroke has a non-zero length, a visible stroke
//     and no remaining dash offset. A zero-length or fully clipped path is
//     invisible to the observer and would never animate in.
//   - JS on, 2s after entering view: every .m-* element is final.
// Then device-specific behaviour: the sticky column moves, the contents index
// follows the reading position, stat rules wait for their counts, one lead
// figure per group, the logo strip hover, the ladder and gate geometry, the
// table edge fade, the form layout, and the header button contrast over a dark
// band. Two contact sheets pair every JS-off and JS-on screenshot.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'devices');
await mkdir(join(OUT, 'nojs'), { recursive: true });
await mkdir(join(OUT, 'js'), { recursive: true });

const ART = '/insights/retrieval-versus-fine-tuning';
const DEVICES = [
  ['Home: constraint gate in hero', '/', '.home-hero-gate'],
  ['Home: How we think, sticky column', '/', '#method'],
  ['Home: stat tiles', '/', '.home-stats'],
  ['Home: clients, gate closed (eyebrow and testimonials)', '/', '[data-review="home-01"]'],
  ['Home: the diagnostic fork', '/', '.fork'],
  ['Work: case index', '/work', '.caseidx'],
  ['Work: case row, interface sketch', '/work', '.caserow'],
  ['Case: snapshot panel', '/work/kalpay', '.panel.cols-5'],
  ['Case: contents index', '/work/kalpay', '.case-idx'],
  ['Case: set-aside options', '/work/kalpay', '#blk-setaside'],
  ['Case: outcome band', '/work/kalpay', '[data-outcome]'],
  ['Services: routing diagram', '/services', '.route'],
  ['Services: service line and card', '/services', '.serviceline'],
  ['Services: engagement timeline', '/services', '.svc-engage-tl'],
  ['Services: the exit ladder', '/services', '.svc-ladder'],
  ['Services: the work', '/services', '.svc-proof'],
  ['Services: fit check', '/services', '#fit-services'],
  ['Diagnostic: incentive table and bars', '/diagnostic', '.dx-why-table'],
  ['Diagnostic: lens gate', '/diagnostic', '.dx-gate'],
  ['Diagnostic: lens 01, process', '/diagnostic', '.lens:nth-child(3) .lensd'],
  ['Diagnostic: lens 02, data', '/diagnostic', '.lens:nth-child(4) .lensd'],
  ['Diagnostic: lens 03, break-even', '/diagnostic', '.lens:nth-child(5) .lensd'],
  ['Diagnostic: phase timeline', '/diagnostic', '.dx-runs-tl'],
  ['Diagnostic: document facsimile', '/diagnostic', '.facs'],
  ['Diagnostic: fit check', '/diagnostic', '#fit-diagnostic'],
  ['Diagnostic: scope delta bars', '/diagnostic', '.dx-bars'],
  ['Insights: featured item', '/insights', '.ins-featured'],
  ['Article: contents index', ART, '.idx-wrap'],
  ['Article: pull-out panel', ART, '.pullout'],
  ['Article: data table', ART, '.table-wrap'],
  ['About: handover diagram', '/about', '.handover'],
  ['About: org shape', '/about', '.org'],
  ['About: not counted row', '/about', '.ab-nc'],
  ['About: footprint map', '/about', '.wmap'],
  ['About: closing band', '/about', '#cta'],
  ['Contact: form and next steps', '/contact', '#top .grid12'],
];

// Runs in the page, scoped to a device root.
function deviceState(root) {
  const SEL = '.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image';
  const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
  const clipFinal = (c) => !c || c === 'none' || /^inset\(0(px)?( 0(px)?){0,3}\)$/.test(c);
  const shown = (el) => el.getClientRects().length > 0;
  const els = [root, ...root.querySelectorAll(SEL)].filter((el) => el.matches(SEL) && shown(el));
  const notFinal = [];
  for (const el of els) {
    const cs = getComputedStyle(el);
    let why = null;
    if (cs.visibility === 'hidden') why = 'hidden';
    else if (parseFloat(cs.opacity) < 0.999) why = 'opacity';
    else if (!identity(cs.transform)) why = 'transform';
    else if (!clipFinal(cs.clipPath)) why = 'clip-path';
    else if (el.classList.contains('m-count') && el.textContent.trim() !== (el.getAttribute('data-final') || '').trim()) why = 'count';
    if (why) notFinal.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ')[0]} ${why}`);
  }
  const clipped = [root, ...root.querySelectorAll('*')].filter((el) => /inset\((100%|0px 0px 100%)/.test(getComputedStyle(el).clipPath)).length;

  let strokes = 0;
  let strokesOk = 0;
  const broken = [];
  for (const svg of root.querySelectorAll('svg')) {
    if (!shown(svg)) continue;
    for (const p of svg.querySelectorAll('path, line, polyline')) {
      strokes++;
      const cs = getComputedStyle(p);
      const len = p.getTotalLength ? p.getTotalLength() : 0;
      const dashed = cs.strokeDasharray !== 'none' && !p.classList.contains('m-node');
      // .m-node strokes fade rather than draw; the map's dot grid is made of
      // zero-length subpaths on purpose, so only visibility is checked there.
      const node = p.classList.contains('m-node');
      const ok = (node || len > 0) && cs.stroke !== 'none' && parseFloat(cs.opacity) > 0.999 && (!dashed || Math.abs(parseFloat(cs.strokeDashoffset)) < 0.001);
      if (ok) strokesOk++;
      else broken.push(`len ${len.toFixed(1)} stroke ${cs.stroke} offset ${cs.strokeDashoffset}`);
    }
  }
  return { primitives: els.length, notFinal, clipped, strokes, strokesOk, broken };
}

const server = await serveDist(join(ROOT, 'dist'), 4490);
const browser = await chromium.launch();
const off = await browser.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
const on = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const rows = [];
let failures = 0;

for (let i = 0; i < DEVICES.length; i++) {
  const [name, route, sel] = DEVICES[i];
  const id = String(i + 1).padStart(2, '0');
  const result = { id, name, route };

  for (const [mode, ctx] of [['nojs', off], ['js', on]]) {
    const page = await ctx.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    const el = page.locator(sel).first();
    await el.scrollIntoViewIfNeeded();
    if (mode === 'js') await page.waitForTimeout(2000);
    await el.screenshot({ path: join(OUT, mode, `${id}.png`) });
    result[mode] = await el.evaluate(deviceState);
    await page.close();
  }

  const ok =
    result.nojs.notFinal.length === 0 &&
    result.nojs.clipped === 0 &&
    result.nojs.strokes === result.nojs.strokesOk &&
    result.js.notFinal.length === 0 &&
    result.js.clipped === 0;
  if (!ok) failures++;
  result.ok = ok;
  rows.push(result);
}

console.log('DEVICES @1440: JS off vs JS on 2s after entering view');
console.log('  ' + '#'.padEnd(4) + 'device'.padEnd(36) + 'm-*'.padEnd(6) + 'JS off: not final / clipped'.padEnd(29) + 'SVG strokes drawn'.padEnd(19) + 'JS on @2s: not final'.padEnd(22) + 'result');
for (const r of rows) {
  console.log(
    '  ' + r.id.padEnd(4) + r.name.padEnd(36) + String(r.nojs.primitives).padEnd(6) +
      `${r.nojs.notFinal.length} / ${r.nojs.clipped}`.padEnd(29) +
      (r.nojs.strokes ? `${r.nojs.strokesOk} / ${r.nojs.strokes}` : '-').padEnd(19) +
      String(r.js.notFinal.length).padEnd(22) + (r.ok ? 'PASS' : 'FAIL')
  );
  for (const n of [...r.nojs.notFinal, ...r.js.notFinal, ...r.nojs.broken].slice(0, 3)) console.log(`        ${n}`);
}

// ---- Behaviour ------------------------------------------------------------
const checks = [];
const record = (name, pass, detail) => {
  checks.push({ name, pass, detail });
  if (!pass) failures++;
};
const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = ([r, g, b]) => {
  const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const ratio = (a, b) => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

{
  const page = await on.newPage();
  await page.goto(server.origin + '/', { waitUntil: 'load' });

  // Stat tiles: the rule waits for the count. The three tiles are peers, so the
  // treatment is uniform — all three figures accent, all three rules in grey.
  await page.waitForTimeout(600);
  const early = await page.evaluate(() => [...document.querySelectorAll('.home-stats .fig-rule')].map((r) => getComputedStyle(r).transform));
  await page.waitForTimeout(1500);
  const late = await page.evaluate(() => ({
    rules: [...document.querySelectorAll('.home-stats .fig-rule')].map((r) => getComputedStyle(r).transform),
    colours: [...document.querySelectorAll('.home-stats .fig-value')].map((f) => getComputedStyle(f).color),
    ruleColours: [...document.querySelectorAll('.home-stats .fig-rule')].map((r) => getComputedStyle(r).backgroundColor),
    accent: (() => { const d = document.createElement('div'); d.style.color = 'var(--accent)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })(),
    rule: (() => { const d = document.createElement('div'); d.style.color = 'var(--rule)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; })(),
  }));
  const undrawnEarly = early.filter((t) => t.startsWith('matrix(0')).length;
  const drawnLate = late.rules.filter((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').length;
  record('Stat tiles: rules undrawn at 600ms, drawn by 2.1s', undrawnEarly === 3 && drawnLate === 3, `undrawn at 600ms ${undrawnEarly}/3, drawn at 2.1s ${drawnLate}/3`);
  const leads = late.colours.map((c) => (c === late.accent ? 'red' : 'ink'));
  const rules = late.ruleColours.map((c) => (c === late.accent ? 'red' : c === late.rule ? 'grey' : 'other'));
  record(
    'Stat tiles: three peers, all figures red, all rules grey',
    leads.join() === 'red,red,red' && rules.join() === 'grey,grey,grey',
    `figures ${leads.join(' / ')}, rules ${rules.join(' / ')}`
  );

  // Sticky column: walk the whole section in 50px steps. It must hold at its
  // sticky offset for a real stretch of scroll, travel down its column by that
  // same distance, and release when the section ends.
  const sec = await page.evaluate(() => { const r = document.querySelector('#method').getBoundingClientRect(); return { top: r.top + scrollY, bottom: r.bottom + scrollY }; });
  const samples = [];
  for (let y = sec.top - 300; y <= sec.bottom; y += 50) {
    await page.evaluate((t) => window.scrollTo(0, t), y);
    await page.waitForTimeout(60);
    samples.push(await page.evaluate(() => {
      const s = document.querySelector('#method .sticky');
      const b = s.getBoundingClientRect();
      return { top: Math.round(b.top), want: Math.round(parseFloat(getComputedStyle(s).top)), inColumn: Math.round(b.top - s.parentElement.getBoundingClientRect().top) };
    }));
  }
  const held = samples.filter((x) => x.top === x.want);
  const span = held.length ? (held.length - 1) * 50 : 0;
  const travel = held.length ? held.at(-1).inColumn - held[0].inColumn : 0;
  const released = samples.at(-1).top < samples.at(-1).want;
  record('How we think: left column sticks, travels, releases', span >= 250 && travel === span && released, `held at ${held[0]?.want}px for ${span}px of scroll, moved ${travel}px down its column, released at section end: ${released ? 'yes' : 'no'}`);

  // Clients: one gate, five confirmed countries. Closed, the section is its
  // eyebrow and its testimonials only: no figures, no map, no strip, and
  // nothing unconfirmed on the page.
  const gate = await page.evaluate(() => {
    const sec = document.querySelector('[data-review="home-01"]');
    return {
      eyebrow: sec.querySelector('.shead-label')?.textContent.trim(),
      figs: sec.querySelectorAll('.fig').length,
      map: !!sec.querySelector('.wmap'),
      strip: !!sec.querySelector('.logostrip'),
      quotes: sec.querySelectorAll('.quote-item').length,
      placeholder: sec.textContent.includes('[PLACEHOLDER]'),
      unverified: ['Meridian', 'Northcote', 'Vantor', 'Helix', 'Arlowe', 'Sabre Freight', 'Ostium', 'Caldera', 'Wren Systems'].filter((n) => document.body.textContent.includes(n)),
    };
  });
  record(
    'Clients, gate closed: eyebrow and three testimonials only',
    /clients/i.test(gate.eyebrow || '') && gate.figs === 0 && !gate.map && !gate.strip && gate.quotes === 3 && !gate.placeholder && gate.unverified.length === 0,
    `eyebrow "${gate.eyebrow}", ${gate.quotes} testimonials, ${gate.figs} figures, map ${gate.map ? 'shown' : 'absent'}, strip ${gate.strip ? 'shown' : 'absent'}, [PLACEHOLDER] ${gate.placeholder ? 'shown' : 'absent'}, unverified names ${gate.unverified.length}`
  );

  // Header button over a dark band.
  await page.mouse.move(5, 500);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#work').getBoundingClientRect().top + scrollY + 60));
  await page.waitForTimeout(500);
  const hb = await page.evaluate(() => {
    const btn = document.querySelector('.hdr .btn');
    const cs = getComputedStyle(btn);
    return { over: document.querySelector('[data-hdr]').getAttribute('data-over'), text: cs.color, fill: cs.backgroundColor, outline: cs.outlineColor, outlineWidth: cs.outlineWidth, band: getComputedStyle(document.querySelector('#work')).backgroundColor };
  });
  const textRatio = ratio(hb.text, hb.fill);
  const edgeRatio = ratio(hb.outline, hb.band);
  record('Header button over dark band: white on --accent, --accent-dark outline', hb.over === 'dark' && textRatio >= 4.5 && hb.outlineWidth === '1px' && edgeRatio >= 3, `text ${textRatio.toFixed(2)}:1; outline ${hb.outlineWidth} at ${edgeRatio.toFixed(2)}:1 against the band; fill against band ${ratio(hb.fill, hb.band).toFixed(2)}:1`);
  await page.close();
}

{
  // Contents index follows the reading position (case study, then article).
  for (const [route, ids] of [['/work/kalpay', ['blk-situation', 'blk-constraint', 'blk-setaside', 'blk-built', 'blk-difference']], [ART, ['intro', 'measured', 'flips']]]) {
    const page = await on.newPage();
    await page.goto(server.origin + route, { waitUntil: 'load' });
    const seen = [];
    for (const id of ids) {
      await page.evaluate((i) => {
        const b = document.getElementById(i);
        window.scrollTo(0, b.getBoundingClientRect().top + scrollY - innerHeight * 0.37 + 4);
      }, id);
      await page.waitForTimeout(350);
      seen.push(await page.evaluate(() => document.querySelector('.idx-link[aria-current="true"]')?.getAttribute('data-idx') ?? 'none'));
    }
    record(`Contents index follows reading (${route})`, seen.join() === ids.join(), seen.join(' > '));
    await page.close();
  }
}

{
  const page = await on.newPage();
  await page.goto(server.origin + '/work/kalpay', { waitUntil: 'load' });
  const sa = await page.evaluate(() => [...document.querySelectorAll('.setaside-item')].map((it) => ({ c: getComputedStyle(it.querySelector('h3')).color, b: getComputedStyle(it).borderLeftWidth })));
  record('Set-aside: options 1-2 muted, option 3 ink with 3px rule', sa[0].c === sa[1].c && sa[2].c !== sa[0].c && sa[2].b === '3px', `colours ${sa.map((x) => x.c).join(' / ')}; rule ${sa[2].b}`);
  await page.close();

  const svc = await on.newPage();
  await svc.goto(server.origin + '/services', { waitUntil: 'load' });
  await svc.evaluate(() => window.scrollTo(0, document.querySelector('.svc-engage-tl').getBoundingClientRect().top + scrollY - 100));
  await svc.waitForTimeout(2200);
  const geo = await svc.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const segs = [...document.querySelectorAll('.svc-engage-tl .tl-seg')].map((x) => x.getBoundingClientRect());
    const cells = [...document.querySelectorAll('.svc-engage-tl .tl-cell')].map((x) => x.getBoundingClientRect());
    return {
      gateX: r('.svc-engage-tl .tl-gate').left, seg1Right: segs[0].right, seg2Left: segs[1].left,
      gateTop: r('.svc-engage-tl .tl-gate').top, labelTop: r('.svc-engage-tl .tl-gate-label').top,
      widths: segs.map((x) => Math.round(x.width)),
      // A label starts where its segment starts; the one after the gate is
      // inset 16px to clear the gate rule.
      aligned: cells.every((c, i) => Math.abs(c.left - segs[i].left) < 0.5 || (i === 1 && Math.abs(c.left - segs[i].left) < 0.5)),
      diagHref: document.querySelector('.svc-engage-tl .tl-cell a')?.getAttribute('href'),
    };
  });
  await svc.evaluate(() => window.scrollTo(0, document.querySelector('.svc-ladder').getBoundingClientRect().top + scrollY - 100));
  await svc.waitForTimeout(2200);
  Object.assign(geo, await svc.evaluate(() => ({
    drops: [...document.querySelectorAll('.exit-drop')].filter((d) => d.getBoundingClientRect().height === 40).length,
    ladder: Math.round(document.querySelector('.ladder-rule').getBoundingClientRect().width),
    ladderBox: Math.round(document.querySelector('.svc-ladder').getBoundingClientRect().width),
  })));
  record('Services timeline: gate at the Diagnostic boundary, labels under their segments', geo.gateX >= geo.seg1Right - 1 && geo.gateX <= geo.seg2Left + 1 && geo.gateTop <= geo.labelTop + 1 && geo.aligned && geo.diagHref === '/diagnostic', `gate x ${Math.round(geo.gateX)} between segment 1 (${Math.round(geo.seg1Right)}) and 2 (${Math.round(geo.seg2Left)}); segment widths ${geo.widths.join(' / ')}px; labels aligned: ${geo.aligned ? 'yes' : 'no'}; Diagnostic links ${geo.diagHref}`);
  record('Exit ladder: full-width top rule, four 40px drop lines', geo.drops === 4 && geo.ladder === geo.ladderBox, `top rule ${geo.ladder}px of ${geo.ladderBox}px; drop lines ${geo.drops}`);
  await svc.close();

  const dx = await on.newPage();
  await dx.goto(server.origin + '/diagnostic', { waitUntil: 'load' });
  await dx.locator('.dx-bars').scrollIntoViewIfNeeded();
  await dx.waitForTimeout(2000);
  const bars = await dx.evaluate(() => [...document.querySelectorAll('.bar-fill')].map((f) => f.getBoundingClientRect().width));
  record('Scope delta bars: grown to full length', Math.abs(bars[1] / bars[0] - 0.46) < 0.01, `delivered / requested = ${(bars[1] / bars[0]).toFixed(3)}`);
  await dx.close();
}

{
  const phone = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const page = await phone.newPage();
  await page.goto(server.origin + ART, { waitUntil: 'load' });
  const mask = await page.evaluate(() => { const cs = getComputedStyle(document.querySelector('.table-wrap')); return cs.maskImage || cs.webkitMaskImage; });
  record('Article table: edge fade below 768', /gradient/.test(mask), mask.slice(0, 60));
  await page.goto(server.origin + '/contact', { waitUntil: 'load' });
  const narrow = await page.evaluate(() => getComputedStyle(document.querySelector('.namerow')).gridTemplateColumns.split(' ').length);
  await page.close();
  await phone.close();
  const wide = await on.newPage();
  await wide.goto(server.origin + '/contact', { waitUntil: 'load' });
  const form = await wide.evaluate(() => ({
    cols: getComputedStyle(document.querySelector('.namerow')).gridTemplateColumns.split(' ').length,
    rows: document.querySelector('textarea').getAttribute('rows'),
    notesRule: getComputedStyle(document.querySelector('.contact-notes')).borderTopWidth,
    action: document.querySelector('form').getAttribute('action'),
    method: document.querySelector('form').getAttribute('method'),
  }));
  record('Contact form: name/email side by side above 768, stacked below', form.cols === 2 && narrow === 1 && form.rows === '6' && form.notesRule === '1px' && form.action === '/api/contact' && form.method === 'post', `columns ${form.cols} at 1440, ${narrow} at 375; textarea rows ${form.rows}; notes rule ${form.notesRule}; ${form.method.toUpperCase()} ${form.action}`);
  await wide.close();
}

console.log('\nBEHAVIOUR');
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name.padEnd(64)} ${c.detail}`);

// ---- Contact sheets -------------------------------------------------------
for (const [part, slice] of [[1, rows.slice(0, 13)], [2, rows.slice(13)]]) {
  const cells = slice
    .map((r) => `<tr><td class="n">${r.id}<br>${r.name}<br><small>${r.route}</small><br><b class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'PASS' : 'FAIL'}</b></td><td><img src="${pathToFileURL(join(OUT, 'nojs', `${r.id}.png`)).href}"></td><td><img src="${pathToFileURL(join(OUT, 'js', `${r.id}.png`)).href}"></td></tr>`)
    .join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:16px;font:12px/1.35 -apple-system,sans-serif;color:black;background:white}table{border-collapse:collapse}td{border-top:1px solid gainsboro;padding:10px;vertical-align:top}td.n{width:170px}img{max-width:560px;max-height:420px;display:block;border:1px solid silver}th{text-align:left;padding:6px 10px}.ok{color:darkgreen}.bad{color:firebrick}</style><h1 style="font-size:14px;margin:0 0 8px">Phase 3 devices at 1440, part ${part} of 2</h1><table><tr><th>Device</th><th>JavaScript disabled</th><th>JavaScript enabled, 2s after entering view</th></tr>${cells}</table>`;
  const file = join(OUT, `sheet-${part}.html`);
  await writeFile(file, html);
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
  await page.screenshot({ path: join(OUT, `devices-sheet-${part}.png`), fullPage: true });
  await page.close();
}
console.log(`\ncontact sheets: verification/devices/devices-sheet-1.png, devices-sheet-2.png`);

await browser.close();
await server.close();
console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
