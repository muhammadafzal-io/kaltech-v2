// Lighthouse on every route, mobile and desktop, reported before any
// optimisation so the cost of each thing is visible rather than only the score.
// Performance, accessibility and best practices, per the brief.
//
// Runs against the built site on a local server, driving the Chromium that
// Playwright already installed.
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import * as chromeLauncher from 'chrome-launcher';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, slugOf } from './routes.mjs';
import { serveDist } from './serve.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'lighthouse');
await mkdir(OUT, { recursive: true });
const CATEGORIES = ['performance', 'accessibility', 'best-practices'];
const TARGET = 95;

const server = await serveDist(join(ROOT, 'dist'), 4510);
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  chromeFlags: ['--headless=new', '--no-sandbox'],
});

const rows = [];
const notes = new Map();

for (const formFactor of ['mobile', 'desktop']) {
  for (const route of ROUTES) {
    const flags = { port: chrome.port, output: 'json', onlyCategories: CATEGORIES, logLevel: 'error' };
    const config = formFactor === 'desktop' ? desktopConfig : undefined;
    const run = await lighthouse(server.origin + route, flags, config);
    const lhr = run.lhr;

    const score = (id) => Math.round((lhr.categories[id]?.score ?? 0) * 100);
    const metric = (id) => lhr.audits[id]?.displayValue ?? '-';
    rows.push({
      route,
      formFactor,
      performance: score('performance'),
      accessibility: score('accessibility'),
      bestPractices: score('best-practices'),
      lcp: metric('largest-contentful-paint'),
      tbt: metric('total-blocking-time'),
      cls: metric('cumulative-layout-shift'),
    });

    // Every audit that did not pass, with what it costs.
    for (const [id, audit] of Object.entries(lhr.audits)) {
      if (audit.score === null || audit.score >= 0.9) continue;
      if (!Object.values(lhr.categories).some((c) => c.auditRefs.some((r) => r.id === id && CATEGORIES.includes(c.id)))) continue;
      const saving = audit.details?.overallSavingsMs ?? audit.details?.overallSavingsBytes ?? null;
      const key = `${id}|${formFactor}`;
      if (!notes.has(key)) notes.set(key, { id, formFactor, title: audit.title, saving, routes: [] });
      notes.get(key).routes.push(route);
    }

    await writeFile(join(OUT, `${slugOf(route)}-${formFactor}.json`), JSON.stringify(lhr));
  }
}

await chrome.kill();
await server.close();

const pad = (s, n) => String(s).padEnd(n);
for (const formFactor of ['mobile', 'desktop']) {
  console.log(`\n${formFactor.toUpperCase()}`);
  console.log('  ' + pad('route', 42) + pad('perf', 7) + pad('a11y', 7) + pad('best practices', 17) + pad('LCP', 10) + pad('TBT', 10) + 'CLS');
  for (const r of rows.filter((x) => x.formFactor === formFactor)) {
    console.log('  ' + pad(r.route, 42) + pad(r.performance, 7) + pad(r.accessibility, 7) + pad(r.bestPractices, 17) + pad(r.lcp, 10) + pad(r.tbt, 10) + r.cls);
  }
  const low = rows.filter((x) => x.formFactor === formFactor && Math.min(x.performance, x.accessibility, x.bestPractices) < TARGET);
  console.log(`  below ${TARGET}: ${low.length ? low.map((x) => x.route).join(', ') : 'none'}`);
}

console.log('\nWHAT COSTS WHAT (every audit scoring under 0.9, before any optimisation)');
for (const n of [...notes.values()].sort((a, b) => (b.saving ?? 0) - (a.saving ?? 0))) {
  const cost = n.saving === null ? '' : typeof n.saving === 'number' && n.saving > 5000 ? `  ~${Math.round(n.saving / 1024)} KiB` : `  ~${Math.round(n.saving)} ms`;
  console.log(`  [${n.formFactor}] ${n.id}${cost}\n      ${n.title}\n      ${n.routes.length} route(s): ${n.routes.slice(0, 4).join(', ')}${n.routes.length > 4 ? ' …' : ''}`);
}

const worst = Math.min(...rows.flatMap((r) => [r.performance, r.accessibility, r.bestPractices]));
console.log(`\n  reports: verification/lighthouse/*.json`);
console.log(worst >= TARGET ? `\n  RESULT: every category at ${TARGET} or above` : `\n  RESULT: lowest category score ${worst}`);
process.exit(worst >= TARGET ? 0 : 1);
