// Verification 2: crawl dist/ and report any internal link that does not resolve.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

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

const files = await walk(DIST);
const pages = files.filter((f) => f.endsWith('.html'));

const results = [];
let checked = 0;

for (const page of pages) {
  const html = await readFile(page, 'utf8');
  const route = '/' + relative(DIST, page).replace(/index\.html$/, '').replace(/\.html$/, '');

  const hrefs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);

  for (const href of hrefs) {
    // External, anchors, and non-http protocols are out of scope.
    if (/^(https?:|mailto:|tel:|#|data:)/.test(href)) continue;

    checked++;
    const [path] = href.split('#');
    if (!path) continue;

    const abs = path.startsWith('/')
      ? join(DIST, path)
      : resolve(dirname(page), path);

    const candidates = [abs, `${abs}.html`, join(abs, 'index.html')];
    const ok = (await Promise.all(candidates.map(exists))).some(Boolean);

    if (!ok) results.push({ from: route || '/', href });
  }
}

console.log('CHECK: internal links resolve in dist/');
console.log(`  pages crawled  ${pages.length}`);
console.log(`  links checked  ${checked}`);
console.log(`  broken         ${results.length}`);
for (const r of results) console.log(`    ${r.from}  ->  ${r.href}`);
console.log(results.length === 0 ? '  RESULT: PASS' : `  RESULT: FAIL (${results.length})`);
process.exit(results.length === 0 ? 0 : 1);
