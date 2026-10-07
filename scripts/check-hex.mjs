// Verification 5: no colour literal exists outside src/styles/tokens.css.
// Scans every authored source file, and every CSS/HTML file in dist/, and
// reports any hex / rgb() / hsl() literal found outside the token layer.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TOKENS = 'src/styles/tokens.css';

const SRC_EXT = new Set(['.astro', '.css', '.ts', '.js', '.mjs', '.md', '.html']);
const SKIP_DIRS = new Set(['node_modules', '.astro', '.git', 'Source', 'Brand', 'verification']);

// The brief and CLAUDE.md quote the palette as prose. They specify the tokens;
// they do not style anything.
const SKIP_FILES = new Set(['CLAUDE.md', 'KalTech ClaudeCode Brief.md', 'README.md']);

// Hex colours, plus functional colour notations.
const PATTERNS = [
  { name: 'hex', re: /#[0-9a-fA-F]{3,8}\b/g },
  { name: 'rgb()', re: /\brgba?\(\s*\d/g },
  { name: 'hsl()', re: /\bhsla?\(\s*\d/g },
];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      // Copies of the build ("dist 2") are compiled, not authored. dist/ itself
      // is walked, and its findings are checked against the tokens below.
      if (e.name !== 'dist' && /^dist\b/.test(e.name)) continue;
      await walk(join(dir, e.name), out);
    } else if (SRC_EXT.has(extname(e.name))) {
      out.push(join(dir, e.name));
    }
  }
  return out;
}

const files = await walk(ROOT);
const findings = [];

for (const file of files) {
  const rel = relative(ROOT, file);
  if (rel === TOKENS) continue;
  if (SKIP_FILES.has(rel)) continue;
  // dist CSS is compiled from tokens.css; it is checked separately below.
  const raw = await readFile(file, 'utf8');
  const text = raw
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const lines = text.split('\n');

  lines.forEach((line, i) => {
    // HTML entities (&#8212;) are not colours.
    const scrubbed = line.replace(/&#\d+;/g, '');
    for (const { name, re } of PATTERNS) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(scrubbed))) {
        findings.push({ file: rel, line: i + 1, kind: name, value: m[0] });
      }
    }
  });
}

// Every literal that survives compilation into dist must be traceable to the
// token layer. Collect the token values and diff.
const tokenText = await readFile(join(ROOT, TOKENS), 'utf8');
const tokenLiterals = new Set();
for (const { re } of PATTERNS) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(tokenText))) tokenLiterals.add(m[0].toLowerCase());
}

const authored = findings.filter((f) => !f.file.startsWith('dist/'));
const distOnly = findings.filter((f) => f.file.startsWith('dist/'));
const distUntraceable = distOnly.filter(
  (f) => !tokenLiterals.has(f.value.toLowerCase())
);

console.log('CHECK: colour literals outside tokens.css');
console.log(`  files scanned            ${files.length}`);
console.log(`  authored-source findings ${authored.length}`);
console.log(`  dist findings            ${distOnly.length} (${distUntraceable.length} not traceable to a token)`);

for (const f of [...authored, ...distUntraceable].slice(0, 40)) {
  console.log(`    ${f.file}:${f.line}  ${f.kind}  ${f.value}`);
}

const failed = authored.length + distUntraceable.length;
console.log(failed === 0 ? '  RESULT: PASS' : `  RESULT: FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
