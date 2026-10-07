// Lists every [PLACEHOLDER] in authored source with its file and line, and
// writes the table into README.md between the placeholder markers.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIRS = ['src/pages', 'src/components', 'src/layouts', 'src/content', 'src/data'];
const TOKEN = '[PLACEHOLDER]';
const START = '<!-- placeholders:start -->';
const END = '<!-- placeholders:end -->';

// Notes on individual placeholders: what they said before the site was
// normalised to one convention, and where a line renders somewhere other than
// the route its source file implies. [needle, note, route override].
const NOTES = [
  [
    'constraintFound: "[PLACEHOLDER]"',
    'KalPay constraint. Rendered by the case cards, not by the KalPay page itself.',
    '/, /work, /work/ahw-global, /work/becs',
  ],
  ['typically [PLACEHOLDER], with', 'Was `[X to Y]` in the standalone Services copy.'],
  ['Reviewed at [PLACEHOLDER] intervals', 'Was `[X]` in the standalone Services copy.'],
  ["constraint: '[PLACEHOLDER]'", 'KalPay constraint. Was `[process]` in the standalone Services copy.'],
  ['"country": "[PLACEHOLDER]"', 'A client country. Renders nowhere until it is confirmed and five countries are, which opens the homepage map.', '(not rendered)'],
  ['"weeks": "[PLACEHOLDER]"', 'The diagnostic length in weeks. Renders twice: the How it runs heading and its timeline scale.', '/diagnostic'],
  ['"findingPages": "[PLACEHOLDER]"', 'The finding length. Renders twice: the facsimile foot and the note beside it.', '/diagnostic'],
  ['"page": "[PLACEHOLDER]"', 'One contents line of the finding facsimile: its page number.', '/diagnostic'],
  ['"sourceNote"', 'The date the record was verified.', '/about'],
  ['hours across the people', 'The hours asked of the client\'s staff.', '/diagnostic'],
  [
    '[PLACEHOLDER] came in asking',
    'Was `[PLACEHOLDER — KALPAY, PENDING CONSTRAINT CONFIRMATION]` in the export.',
  ],
];

async function walk(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else if (['.astro', '.md', '.json'].includes(extname(e.name))) out.push(p);
  }
  return out;
}

function routeOf(rel, text) {
  let m;
  if (rel === 'src/pages/index.astro') return '/';
  if ((m = rel.match(/^src\/pages\/(.+)\.astro$/))) return '/' + m[1].replace(/\/index$/, '');
  if ((m = rel.match(/^src\/content\/(work|insights)\/(.+)\.md$/))) {
    const route = `/${m[1]}/${m[2]}`;
    return /^published:\s*false/m.test(text) ? `${route} (unpublished)` : route;
  }
  if (rel.startsWith('src/data/')) return '(data)';
  return '(shared)';
}

function context(line) {
  // Where the token sits inside a tag's attribute, stripping tags would erase it.
  const stripped = line.replace(/<[^>]+>/g, ' ');
  const flat = (stripped.includes(TOKEN) ? stripped : line)
    .replace(/&#8212;/g, '—')
    .replace(/&#183;/g, '·')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const i = flat.indexOf(TOKEN);
  const from = Math.max(0, i - 48);
  const to = Math.min(flat.length, i + TOKEN.length + 48);
  const snippet = (from > 0 ? '…' : '') + flat.slice(from, to) + (to < flat.length ? '…' : '');
  return '`' + snippet.replace(/\|/g, '\\|').replace(/`/g, "'") + '`';
}

const files = (await Promise.all(DIRS.map((d) => walk(join(ROOT, d))))).flat().sort();
const rows = [];

for (const file of files) {
  const text = await readFile(file, 'utf8');
  const rel = relative(ROOT, file).split(sep).join('/');
  text.split('\n').forEach((line, i) => {
    const n = line.split(TOKEN).length - 1;
    if (!n) return;
    // Code that mentions the token is not a placeholder on the site.
    if (/^\s*(\/\/|\/\*|\*)/.test(line) || line.includes(`=== '${TOKEN}'`) || line.includes(`!== '${TOKEN}'`)) return;
    const hit = NOTES.find(([needle]) => line.includes(needle));
    rows.push({
      route: hit?.[2] ?? routeOf(rel, text),
      source: `${rel}:${i + 1}`,
      n,
      ctx: context(line),
      note: hit?.[1] ?? '',
    });
  });
}

const total = rows.reduce((s, r) => s + r.n, 0);

// The same count as rendered in the build, when there is one.
let rendered = null;
try {
  rendered = 0;
  const walkHtml = async (dir, out = []) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const q = join(dir, e.name);
      if (e.isDirectory()) await walkHtml(q, out);
      else if (e.name.endsWith('.html')) out.push(q);
    }
    return out;
  };
  for (const f of await walkHtml(join(ROOT, 'dist'))) rendered += (await readFile(f, 'utf8')).split(TOKEN).length - 1;
} catch {
  rendered = null;
}
const routes = new Set(rows.map((r) => r.route));
const sources = new Set(rows.map((r) => r.source.split(':')[0]));

const table = [
  `**${total}** occurrences of \`[PLACEHOLDER]\` in **${sources.size}** source files` +
    (rendered === null ? '.' : `, rendering as **${rendered}** in the built site (see the notes for lines that render more than once).`) +
    ' Regenerate with `npm run placeholders` after a build.',
  '',
  '| # | Route | Source | n | Context | Note |',
  '|---|---|---|---|---|---|',
  ...rows.map(
    (r, i) => `| ${i + 1} | \`${r.route}\` | \`${r.source}\` | ${r.n} | ${r.ctx} | ${r.note} |`
  ),
].join('\n');

const readmePath = join(ROOT, 'README.md');
const readme = await readFile(readmePath, 'utf8');
const a = readme.indexOf(START);
const b = readme.indexOf(END);
if (a === -1 || b === -1) {
  console.error('README.md is missing the placeholder markers');
  process.exit(1);
}
await writeFile(readmePath, readme.slice(0, a + START.length) + '\n' + table + '\n' + readme.slice(b));

console.log(`placeholders: ${total} in source, ${rendered ?? 'n/a'} rendered, ${sources.size} files -> README.md`);
