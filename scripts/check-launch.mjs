// The builds the launch depends on, each run for real.
//
//   1. Preview build (SITE_ENV unset). Every page noindex,nofollow; robots.txt
//      disallows all; no sitemap.xml, no llms.txt. [PLACEHOLDER] is allowed.
//   2. Production build with the data as it is. It must FAIL, naming every
//      page and string where [PLACEHOLDER] renders, and leave nothing behind.
//   3. Production build with every [PLACEHOLDER] in the page sources replaced
//      by a throwaway value. It must PASS: indexable pages, robots.txt allowing
//      crawlers, sitemap.xml and llms.txt. The sources are then restored byte
//      for byte, and every file under src/ is hashed before and after to prove it.
//   4. A build with the inline motion script changed and vercel.json not. It
//      must FAIL on the Content-Security-Policy hash. motion.js is restored.
//
// Output goes to verification/launch/. The filled build carries test values
// and must never be deployed; nothing here touches dist/.
import { execFile } from 'node:child_process';
import { readdir, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'verification', 'launch');
const FILL = 'Test value';
const PLACEHOLDER = '[PLACEHOLDER]';
// Where page copy and data live. The gate itself (src/integrations) and the
// JSON-LD helpers (src/lib) are code and are left alone.
const FILL_DIRS = ['src/content', 'src/data', 'src/pages', 'src/components'];

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function treeHash(dir) {
  const files = (await walk(dir)).sort();
  const map = new Map();
  for (const f of files) map.set(relative(ROOT, f), sha(await readFile(f)));
  return map;
}

function build(outDir, extra = {}) {
  const env = { ...process.env };
  delete env.SITE_ENV;
  return new Promise((resolve) => {
    execFile(
      'npx',
      ['astro', 'build', '--outDir', outDir],
      { cwd: ROOT, env: { ...env, ...extra }, maxBuffer: 1 << 28 },
      (err, stdout, stderr) => resolve({ code: err ? (err.code ?? 1) : 0, log: `${stdout}\n${stderr}` })
    );
  });
}
const htmlFiles = async (dir) => (await walk(dir)).filter((f) => f.endsWith('.html'));
const list = async (dir) => (await readdir(dir).catch(() => []));

const results = [];
const record = (name, ok, detail) => results.push({ name, ok, detail });

// 1. Preview.
{
  const dir = join(OUT, 'preview');
  const { code } = await build(dir);
  const pages = await htmlFiles(dir);
  let noindex = 0;
  for (const f of pages) if (/<meta name="robots" content="noindex,nofollow"/.test(await readFile(f, 'utf8'))) noindex++;
  const files = await list(dir);
  const robots = files.includes('robots.txt') ? await readFile(join(dir, 'robots.txt'), 'utf8') : '';
  let rendered = 0;
  for (const f of pages) rendered += (await readFile(f, 'utf8')).split(PLACEHOLDER).length - 1;
  const ok = code === 0 && noindex === pages.length && /User-agent: \*\nDisallow: \/\n/.test(robots) && !files.includes('sitemap.xml') && !files.includes('llms.txt');
  record('1. preview build', ok, [
    `exit ${code}`,
    `noindex,nofollow on ${noindex}/${pages.length} pages`,
    `robots.txt: ${robots.trim().split('\n').filter((l) => !l.startsWith('#')).join(' / ')}`,
    `sitemap.xml ${files.includes('sitemap.xml') ? 'present' : 'absent'} · llms.txt ${files.includes('llms.txt') ? 'present' : 'absent'}`,
    `[PLACEHOLDER] rendered ${rendered} times (allowed in preview)`,
  ]);
}

// 2. Production, as the data stands.
let gateListing = '';
{
  const dir = join(OUT, 'production-gated');
  const { code, log } = await build(dir, { SITE_ENV: 'production' });
  const start = log.indexOf('LAUNCH GATE');
  gateListing = start >= 0 ? log.slice(start, log.indexOf('\n\n', start) >= 0 ? log.indexOf('\n\n', start) : undefined).trimEnd() : '';
  const left = await list(dir);
  const ok = code !== 0 && start >= 0 && left.length === 0;
  record('2. production build, data as it is', ok, [
    `exit ${code} (must be non-zero)`,
    `launch gate message: ${start >= 0 ? 'yes' : 'NO'}`,
    `files left in the output directory: ${left.length}`,
  ]);
}

// 3. Production, placeholders filled with a throwaway value.
{
  const before = await treeHash(join(ROOT, 'src'));
  const originals = new Map();
  for (const d of FILL_DIRS) {
    for (const f of await walk(join(ROOT, d))) {
      const bytes = await readFile(f);
      if (bytes.includes(PLACEHOLDER)) originals.set(f, bytes);
    }
  }
  let filled = 0;
  let res;
  const dir = join(OUT, 'production-filled');
  try {
    for (const [f, bytes] of originals) {
      const text = bytes.toString('utf8');
      filled += text.split(PLACEHOLDER).length - 1;
      await writeFile(f, text.split(PLACEHOLDER).join(FILL));
    }
    res = await build(dir, { SITE_ENV: 'production' });
  } finally {
    for (const [f, bytes] of originals) await writeFile(f, bytes);
  }
  const after = await treeHash(join(ROOT, 'src'));
  const changed = [...before].filter(([f, h]) => after.get(f) !== h).map(([f]) => f);
  const added = [...after.keys()].filter((f) => !before.has(f));

  const files = await list(dir);
  const pages = await htmlFiles(dir);
  let indexable = 0;
  let leaks = 0;
  for (const f of pages) {
    const html = await readFile(f, 'utf8');
    if (!/<meta name="robots"/.test(html)) indexable++;
    leaks += html.split(PLACEHOLDER).length - 1;
  }
  const robots = files.includes('robots.txt') ? await readFile(join(dir, 'robots.txt'), 'utf8') : '';
  const sitemap = files.includes('sitemap.xml') ? await readFile(join(dir, 'sitemap.xml'), 'utf8') : '';
  const urls = (sitemap.match(/<loc>/g) ?? []).length;
  const warnings = (res.log.match(/has changed since its lastmod was recorded/g) ?? []).length;
  const ok =
    res.code === 0 &&
    indexable === 13 &&
    leaks === 0 &&
    /User-agent: \*\nAllow: \//.test(robots) &&
    urls === 13 &&
    files.includes('llms.txt') &&
    changed.length === 0 &&
    added.length === 0;
  record('3. production build, placeholders filled', ok, [
    `${filled} occurrences in ${originals.size} source files replaced with "${FILL}"`,
    `exit ${res.code}`,
    `indexable pages ${indexable}/13 (the 404 stays noindex) · [PLACEHOLDER] in output: ${leaks}`,
    `robots.txt allows all and names ${['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'].filter((ua) => robots.includes(ua)).join(', ')}`,
    `sitemap.xml ${urls} URLs · llms.txt ${files.includes('llms.txt') ? 'written' : 'MISSING'}`,
    `lastmod left out for ${warnings} content file(s) whose bytes the fill changed (expected: the record no longer matches them)`,
    `restored: ${before.size} files under src/ hashed before and after; changed ${changed.length}, added ${added.length}${changed.length ? ': ' + changed.join(', ') : ''}`,
  ]);
}

// 4. The CSP hash drifts from the inline script.
{
  const motion = join(ROOT, 'src/scripts/motion.js');
  const original = await readFile(motion);
  let res;
  const dir = join(OUT, 'csp-drift');
  try {
    await writeFile(motion, Buffer.concat([original, Buffer.from('\n// csp drift test\n')]));
    res = await build(dir);
  } finally {
    await writeFile(motion, original);
  }
  const restored = sha(await readFile(motion)) === sha(original);
  const msg = res.log.match(/CSP: an inline script[^\n]*/)?.[0] ?? '';
  record('4. inline script changed, hash not', res.code !== 0 && !!msg && restored, [
    `exit ${res.code} (must be non-zero)`,
    `message: ${msg ? msg.slice(0, 150) + '…' : 'NONE'}`,
    `motion.js restored byte for byte: ${restored ? 'yes' : 'NO'}`,
  ]);
}

// lastmod: the record against the content as it stands now.
{
  const stamps = JSON.parse(await readFile(join(ROOT, 'src/data/lastmod.json'), 'utf8')).files;
  const rows = [];
  for (const [rel, { sha256, lastmod }] of Object.entries(stamps)) {
    rows.push(`${lastmod} ${rel} ${sha(await readFile(join(ROOT, rel))) === sha256 ? 'matches' : 'STALE'}`);
  }
  record('lastmod record matches the content files', rows.every((r) => r.endsWith('matches')), rows);
}

console.log('LAUNCH BUILDS\n');
for (const r of results) {
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}`);
  for (const d of r.detail) console.log(`          ${d}`);
}
console.log('\n  The launch gate, as a production build prints it today:\n');
console.log(gateListing.split('\n').map((l) => '    ' + l).join('\n'));
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `\nRESULT: FAIL (${failed})` : '\nRESULT: PASS');
process.exit(failed ? 1 : 0);
