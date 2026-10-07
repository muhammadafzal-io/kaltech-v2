// Review build.
//
// Astro emits root-absolute URLs: page links like /work and assets like
// /_astro/index.css. Opened over file:// those resolve against the filesystem
// root, so the CSS, the fonts and every link break. No Astro option fixes the
// links, because they are authored as root-absolute strings; `base` only adds a
// prefix and never makes a path relative to the page that contains it.
//
// This rewrites every root-absolute URL in dist/ into a path relative to the
// file that holds it, and points page links at the page's index.html. It covers
// HTML attributes, url() in stylesheets, and url() inside inline <style>.
//
// Review only. `npm run build` keeps clean URLs for production; this runs after
// it through `npm run build:review`. Never deploy a relativised dist/.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, relative, dirname, extname, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

// href/src/poster, deliberately not `action`: a form POST cannot work from the
// filesystem, and rewriting it would only point it at a file that does not exist.
const ATTR = /(?<attr>\b(?:href|src|poster)=)(?<q>["'])(?<url>\/(?!\/)[^"']*)\k<q>/g;
const CSS_URL = /url\((?<q>["']?)(?<url>\/(?!\/)[^)"']+)\k<q>\)/g;

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const isFile = async (p) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

const toPosix = (p) => p.split(sep).join('/');

// '/' -> 'index.html', '/work' -> 'work/index.html', '/_astro/a.css' -> '_astro/a.css'
async function targetFor(pathname) {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '').replace(/\/+$/, '');
  if (clean === '') return 'index.html';
  if (await isFile(join(DIST, clean))) return clean;
  if (await isFile(join(DIST, clean, 'index.html'))) return `${clean}/index.html`;
  if (await isFile(join(DIST, `${clean}.html`))) return `${clean}.html`;
  return null;
}

function relativeFrom(file, target) {
  const fromDir = toPosix(dirname(relative(DIST, file)));
  const r = posix.relative(fromDir === '.' ? '.' : fromDir, target);
  return r.startsWith('.') ? r : `./${r}`;
}

function splitSuffix(url) {
  const i = url.search(/[?#]/);
  return i === -1 ? [url, ''] : [url.slice(0, i), url.slice(i)];
}

const unresolved = [];
let rewrites = 0;

async function rewrite(text, file, pattern, build) {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const [path, suffix] = splitSuffix(m.groups.url);
    const target = await targetFor(path);
    out += text.slice(last, m.index);
    if (target) {
      out += build(m.groups, relativeFrom(file, target) + suffix);
      rewrites++;
    } else {
      out += m[0];
      unresolved.push(`${toPosix(relative(DIST, file))}: ${m.groups.url}`);
    }
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

// Font preloads are dropped from the review build. A font is fetched in CORS
// mode, so the tag carries `crossorigin`; over file:// the page has an opaque
// origin and that request always fails. The fonts themselves still load from the
// stylesheet, so the preload buys nothing here and would otherwise leave four
// failed requests on every page for someone to chase.
const FONT_PRELOAD = /[ \t]*<link rel="preload" as="font"[^>]*>\n?/g;

const files = (await walk(DIST)).filter((f) => ['.html', '.css'].includes(extname(f)));
let changed = 0;
let preloadsDropped = 0;

for (const file of files) {
  const before = await readFile(file, 'utf8');
  let after = before;
  if (file.endsWith('.html')) {
    preloadsDropped += (after.match(FONT_PRELOAD) ?? []).length;
    after = after.replace(FONT_PRELOAD, '');
    after = await rewrite(after, file, ATTR, (g, url) => `${g.attr}${g.q}${url}${g.q}`);
  }
  after = await rewrite(after, file, CSS_URL, (g, url) => `url(${g.q}${url}${g.q})`);
  if (after !== before) {
    await writeFile(file, after);
    changed++;
  }
}

console.log('REVIEW BUILD: root-absolute URLs rewritten to relative paths');
console.log(`  files scanned   ${files.length}`);
console.log(`  files changed   ${changed}`);
console.log(`  URLs rewritten  ${rewrites}`);
console.log(`  font preloads dropped  ${preloadsDropped} (they cannot be fetched over file://)`);
console.log(`  unresolved      ${unresolved.length}`);
for (const u of unresolved) console.log(`    ${u}`);
process.exit(unresolved.length ? 1 : 0);
