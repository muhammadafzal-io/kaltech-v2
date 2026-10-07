// Review-build check: every page in dist/ opens from the filesystem over
// file://, with no server, in each installed browser engine. A page passes when
// its stylesheet is applied, no font fails, no request fails, nothing goes to
// the network, and every internal link points at a file that exists.
//
//   node scripts/check-file-protocol.mjs            all installed engines
//   node scripts/check-file-protocol.mjs chromium   one engine
import { chromium, webkit, firefox } from 'playwright';
import { readdir, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const only = process.argv[2];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

const pages = (await walk(DIST)).filter((f) => f.endsWith('.html')).sort();
const engines = [
  ['chromium', chromium],
  ['webkit', webkit],
  ['firefox', firefox],
].filter(([name]) => !only || name === only);

// Present on every page: the header wordmark (Sora 700) and body copy
// (Instrument Sans 400). The union across the site must also hold 600 and 500.
const REQUIRED_PER_PAGE = ['Sora 700', 'Instrument Sans 400'];
const REQUIRED_SITE = ['Sora 600', 'Sora 700', 'Instrument Sans 400', 'Instrument Sans 500'];

let failures = 0;

for (const [name, type] of engines) {
  let browser;
  try {
    browser = await type.launch();
  } catch (e) {
    console.log(`\n[${name}] not run: ${e.message.split('\n')[0]}`);
    continue;
  }

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const rows = [];
  const siteFonts = new Set();

  for (const file of pages) {
    const page = await ctx.newPage();
    const failed = [];
    const network = [];
    page.on('requestfailed', (r) => failed.push(r.url()));
    page.on('request', (r) => {
      if (/^https?:/.test(r.url())) network.push(r.url());
    });

    await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });

    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const wrap = document.querySelector('.wrap');
      const faces = [...document.fonts];
      return {
        js: document.documentElement.classList.contains('m-js'),
        cssApplied: !!wrap && getComputedStyle(wrap).maxWidth === '1464px',
        loaded: [
          ...new Set(
            faces
              .filter((f) => f.status === 'loaded')
              .map((f) => `${f.family.replace(/["']/g, '')} ${f.weight}`)
          ),
        ],
        fontErrors: faces.filter((f) => f.status === 'error').length,
        hrefs: [...document.querySelectorAll('a[href]')]
          .map((a) => a.href)
          .filter((h) => h.startsWith('file:')),
      };
    });

    const broken = [];
    for (const href of new Set(r.hrefs)) {
      const path = fileURLToPath(href.split('#')[0].split('?')[0]);
      if (!(await exists(path))) broken.push(href);
    }

    r.loaded.forEach((f) => siteFonts.add(f));
    const fontsOk = REQUIRED_PER_PAGE.every((f) => r.loaded.includes(f));
    const ok =
      r.js && r.cssApplied && fontsOk && r.fontErrors === 0 && !failed.length && !network.length && !broken.length;
    if (!ok) failures++;

    rows.push({
      page: relative(DIST, file).split(sep).join('/'),
      js: r.js,
      css: r.cssApplied,
      fonts: r.loaded.length,
      fontsOk,
      fontErrors: r.fontErrors,
      failed: failed.length,
      network: network.length,
      links: new Set(r.hrefs).size,
      broken: broken.length,
      ok,
      detail: [...failed.slice(0, 2), ...broken.slice(0, 2)],
    });
    await page.close();
  }

  // Navigation over file:// in the browser itself, both directions.
  const nav = await ctx.newPage();
  const follow = async (from, selector, expected) => {
    try {
      await nav.goto(pathToFileURL(from).href, { waitUntil: 'load' });
      await nav.click(selector, { timeout: 5000 });
      await nav.waitForURL(expected, { timeout: 5000 });
      return await nav.evaluate(
        () => getComputedStyle(document.querySelector('.wrap')).maxWidth === '1464px'
      );
    } catch {
      return false;
    }
  };
  const down = await follow(join(DIST, 'index.html'), '.nav-desk a.nav-link:text-is("Work")', /\/work\/index\.html$/);
  const up = await follow(join(DIST, 'work', 'kalpay', 'index.html'), 'a.wordmark', /\/dist\/index\.html$/);
  if (!down || !up) failures++;

  // The motion script is a classic inline script, so it must run from file://
  // too. On the homepage, the script arms and every .m-* element on the first
  // screen has settled into its final state within 2.2s of load.
  const first = await ctx.newPage();
  await first.goto(pathToFileURL(join(DIST, 'index.html')).href, { waitUntil: 'load' });
  await first.waitForTimeout(2200);
  const motion = await first.evaluate(() => {
    const identity = (t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)';
    const clipFinal = (c) => c === 'none' || /^inset\(0(px)?( 0(px)?){0,3}\)$/.test(c);
    const onScreen = [...document.querySelectorAll('.m-reveal, .m-rule, .m-count, .m-draw, .m-band, .m-image')].filter((el) => {
      const b = el.getBoundingClientRect();
      return b.height > 0 && b.top < innerHeight && b.bottom > 0;
    });
    const unsettled = onScreen.filter((el) => {
      const cs = getComputedStyle(el);
      return cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.999 || !identity(cs.transform) || !clipFinal(cs.clipPath);
    });
    return {
      armed: document.documentElement.classList.contains('m-armed'),
      onScreen: onScreen.length,
      unsettled: unsettled.length,
    };
  });
  await first.close();
  if (!motion.armed || motion.unsettled) failures++;

  await browser.close();

  const missingSite = REQUIRED_SITE.filter((f) => !siteFonts.has(f));
  if (missingSite.length) failures++;

  console.log(`\n[${name}]  file://, no server, 1440px`);
  console.log(
    '  ' +
      'page'.padEnd(46) +
      'css'.padEnd(6) +
      'js'.padEnd(5) +
      'fonts'.padEnd(7) +
      'fontErr'.padEnd(9) +
      'reqFail'.padEnd(9) +
      'http'.padEnd(6) +
      'links'.padEnd(7) +
      'broken'.padEnd(8) +
      'result'
  );
  for (const x of rows) {
    console.log(
      '  ' +
        x.page.padEnd(46) +
        (x.css ? 'yes' : 'NO').padEnd(6) +
        (x.js ? 'yes' : 'NO').padEnd(5) +
        (String(x.fonts) + (x.fontsOk ? '' : '!')).padEnd(7) +
        String(x.fontErrors).padEnd(9) +
        String(x.failed).padEnd(9) +
        String(x.network).padEnd(6) +
        String(x.links).padEnd(7) +
        String(x.broken).padEnd(8) +
        (x.ok ? 'PASS' : 'FAIL')
    );
    for (const d of x.detail) console.log(`      ${d}`);
  }
  console.log(`  fonts loaded across site: ${[...siteFonts].sort().join(', ')}`);
  console.log(`  missing from site:        ${missingSite.length ? missingSite.join(', ') : 'none'}`);
  console.log(`  click-through  index -> Work: ${down ? 'PASS' : 'FAIL'}   kalpay -> wordmark -> index: ${up ? 'PASS' : 'FAIL'}`);
  console.log(`  motion over file://  script armed: ${motion.armed ? 'yes' : 'NO'}   first screen: ${motion.onScreen} .m-* elements, ${motion.unsettled} not final after 2.2s`);
}

console.log(failures ? `\nRESULT: FAIL (${failures})` : '\nRESULT: PASS');
process.exit(failures ? 1 : 0);
