// Crawl control, written after every build from the pages Astro actually built.
//
// SITE_ENV decides the build (see astro.config.mjs). It is `preview` unless set
// to `production`.
//
//   preview     robots.txt disallows everything. No sitemap, no llms.txt. Every
//               page carries noindex,nofollow (src/layouts/Base.astro).
//               [PLACEHOLDER] is allowed.
//   production  robots.txt allows every crawler, AI crawlers named, and points
//               at the sitemap. sitemap.xml and llms.txt list the indexable
//               pages. THE LAUNCH GATE: if [PLACEHOLDER] renders on any
//               indexable page, the build fails, naming each page and string,
//               and the output directory is emptied so nothing half-checked can
//               be deployed.
//
// In both modes: every inline script's sha256 must be in the Content-Security-
// Policy in vercel.json, and every hash there must still be in use. Change the
// inline motion script without updating the hash and the build fails.
//
// Pages are read from the output, so the sitemap cannot drift from the site: a
// page's <loc> is its own canonical, and a page is listed only if it is built
// and indexable.
import { readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://kaltech.online';
const PLACEHOLDER = '[PLACEHOLDER]';
const AI_CRAWLERS = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended'];

async function walk(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p, out);
    else out.push(p);
  }
  return out;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);

const attr = (tag, name) => tag?.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;
const metaContent = (html, name) => attr(html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*>`))?.[0], 'content');

function parse(html) {
  return {
    title: decode(html.match(/<title>([^<]*)<\/title>/)?.[1] ?? ''),
    description: decode(metaContent(html, 'description') ?? ''),
    robots: metaContent(html, 'robots') ?? '',
    canonical: attr(html.match(/<link[^>]*rel="canonical"[^>]*>/)?.[0], 'href'),
    scripts: [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)]
      .filter((m) => !/type="(?!text\/javascript|module)[^"]*"/.test(m[1]))
      .map((m) => m[2]),
  };
}

// Every [PLACEHOLDER] a reader would see, with the text either side of it so
// it can be found on the page. Script and style bodies are not rendered and are
// skipped; JSON-LD is published and is not.
function placeholders(html) {
  const found = [];
  const body = html.replace(/<(script|style)(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/\1>/g, '<$1></$1>');
  for (const m of body.matchAll(/<[^>]*\[PLACEHOLDER\][^>]*>/g)) {
    const a = m[0].match(/([\w:-]+)="([^"]*\[PLACEHOLDER\][^"]*)"/);
    found.push(a ? `${a[1]}="${decode(a[2])}"` : m[0]);
  }
  const text = body
    .replace(/<[^>]*>/g, '\u0000')
    .split('\u0000')
    .map((t) => decode(t).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  text.forEach((t, i) => {
    if (!t.includes(PLACEHOLDER)) return;
    const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
    const before = t === PLACEHOLDER && text[i - 1] ? `${clip(text[i - 1], 48)} | ` : '';
    const after = t === PLACEHOLDER && text[i + 1] ? ` | ${clip(text[i + 1], 48)}` : '';
    for (let k = 0; k < t.split(PLACEHOLDER).length - 1; k++) found.push(`${before}${clip(t, 120)}${after}`);
  });
  return found;
}

const sha256 = (s) => createHash('sha256').update(s).digest('base64');

export default function seo({ mode }) {
  if (mode !== 'preview' && mode !== 'production') {
    throw new Error(`SITE_ENV must be "preview" or "production", not "${mode}".`);
  }
  let root;

  return {
    name: 'kaltech-seo',
    hooks: {
      'astro:config:done': ({ config }) => {
        root = fileURLToPath(config.root);
      },
      'astro:build:done': async ({ dir, logger }) => {
        const out = fileURLToPath(dir);
        const files = (await walk(out)).filter((f) => f.endsWith('.html'));
        const pages = [];
        for (const file of files) {
          const rel = relative(out, file).split(sep).join('/');
          const path = rel === 'index.html' ? '/' : '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
          const html = await readFile(file, 'utf8');
          pages.push({ path, html, ...parse(html) });
        }
        const problems = [];

        // The mode the pages were rendered in must be the mode this hook writes for.
        for (const p of pages) {
          if (mode === 'preview' && !/noindex/.test(p.robots)) problems.push(`${p.path}: preview build without noindex`);
          if (mode === 'production' && /nofollow/.test(p.robots)) problems.push(`${p.path}: production build carries the preview robots meta`);
        }

        // Content-Security-Policy: the hashes in vercel.json against the inline scripts built.
        const vercel = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
        const csp = (vercel.headers ?? [])
          .flatMap((h) => h.headers)
          .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value;
        if (!csp) problems.push('vercel.json: no Content-Security-Policy header');
        const allowed = new Set([...(csp ?? '').matchAll(/'sha256-([^']+)'/g)].map((m) => m[1]));
        const used = new Map();
        for (const p of pages) for (const s of p.scripts) used.set(sha256(s), [...(used.get(sha256(s)) ?? []), p.path]);
        for (const [hash, where] of used) {
          if (!allowed.has(hash)) {
            problems.push(`CSP: an inline script on ${where.length} page(s), first ${where[0]}, hashes to 'sha256-${hash}', which vercel.json does not allow. Update the hash in vercel.json.`);
          }
        }
        for (const hash of allowed) if (!used.has(hash)) problems.push(`CSP: vercel.json allows 'sha256-${hash}', which no built script uses. Remove it.`);

        const indexable = pages.filter((p) => !/noindex/.test(p.robots));

        // The launch gate.
        if (mode === 'production') {
          const leaks = indexable
            .map((p) => ({ path: p.path, found: placeholders(p.html) }))
            .filter((l) => l.found.length);
          if (leaks.length) {
            const total = leaks.reduce((n, l) => n + l.found.length, 0);
            const lines = leaks
              .sort((a, b) => a.path.localeCompare(b.path))
              .flatMap((l) => [`  ${l.path} (${l.found.length})`, ...l.found.map((f) => `      ${f}`)]);
            problems.push(
              `LAUNCH GATE: [PLACEHOLDER] renders ${total} times on ${leaks.length} indexable page(s). A production build cannot ship it.\n${lines.join('\n')}`
            );
          }
        }

        if (problems.length) {
          for (const e of await readdir(out)) await rm(join(out, e), { recursive: true, force: true });
          throw new Error(`kaltech-seo: ${problems.length} problem(s). ${out} has been emptied.\n\n${problems.join('\n\n')}\n`);
        }

        // robots.txt
        const robots =
          mode === 'production'
            ? ['User-agent: *', 'Allow: /', '', ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, 'Allow: /', '']), `Sitemap: ${SITE}/sitemap.xml`, '']
            : ['# Preview build: nothing here is for search.', 'User-agent: *', 'Disallow: /', ''];
        await writeFile(join(out, 'robots.txt'), robots.join('\n'));

        if (mode === 'production') {
          const order = (p) => (p.path === '/' ? '' : p.path);
          indexable.sort((a, b) => order(a).localeCompare(order(b)));
          for (const p of indexable) {
            const expected = SITE + p.path;
            if (p.canonical !== (p.path === '/' ? `${SITE}/` : expected)) {
              throw new Error(`kaltech-seo: ${p.path} has canonical ${p.canonical}; expected ${expected}.`);
            }
          }

          // lastmod: only where a content file stands behind the page and its
          // recorded modification date still matches its bytes (npm run lastmod).
          const stamps = JSON.parse(await readFile(join(root, 'src/data/lastmod.json'), 'utf8')).files ?? {};
          const lastmodOf = async (path) => {
            const m = path.match(/^\/(work|insights)\/([^/]+)$/);
            if (!m) return null;
            const source = `src/content/${m[1]}/${m[2]}.md`;
            const stamp = stamps[source];
            if (!stamp) return null;
            const bytes = await readFile(join(root, source)).catch(() => null);
            if (!bytes || createHash('sha256').update(bytes).digest('hex') !== stamp.sha256) {
              logger.warn(`${source} has changed since its lastmod was recorded; its sitemap entry has no lastmod. Run npm run lastmod.`);
              return null;
            }
            return stamp.lastmod;
          };
          const urls = [];
          for (const p of indexable) {
            const lastmod = await lastmodOf(p.path);
            urls.push(`  <url><loc>${p.canonical}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}</url>`);
          }
          await writeFile(
            join(out, 'sitemap.xml'),
            `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
          );

          // llms.txt: the same page set, each with its own title and description.
          const org = JSON.parse(await readFile(join(root, 'src/data/organization.json'), 'utf8'));
          const real = (v) => typeof v === 'string' && v && v !== PLACEHOLDER;
          const item = (p) => `- [${p.title.replace(/ \| KalTech$/, '')}](${p.canonical}): ${p.description}`;
          const group = (test) => indexable.filter((p) => test(p.path)).map(item);
          const legal = (path) => path === '/privacy' || path === '/terms';
          const llms = [
            `# ${org.name}`,
            '',
            `> ${org.description}`,
            '',
            `Legal name: ${org.legalName}`,
            '',
            '## Pages',
            '',
            ...group((path) => !/^\/(work|insights)\/./.test(path) && !legal(path)),
            '',
            '## Case studies',
            '',
            ...group((path) => /^\/work\/./.test(path)),
            '',
            '## Insights',
            '',
            ...group((path) => /^\/insights\/./.test(path)),
            '',
            '## Company',
            '',
            `- [Email](mailto:${org.email})`,
            ...(real(org.linkedin) ? [`- [LinkedIn](${org.linkedin})`] : []),
            '',
            '## Optional',
            '',
            ...group(legal),
            '',
          ].join('\n');
          await writeFile(join(out, 'llms.txt'), llms);

          const leaks = [['sitemap.xml', urls.join('\n')], ['llms.txt', llms]].filter(([, t]) => t.includes(PLACEHOLDER));
          if (leaks.length) throw new Error(`kaltech-seo: [PLACEHOLDER] in ${leaks.map(([f]) => f).join(', ')}.`);

          logger.info(`production: ${indexable.length} indexable pages; sitemap.xml, llms.txt and robots.txt (allow) written.`);
        } else {
          logger.info(`preview: ${pages.length} pages noindexed; robots.txt disallows all; no sitemap.xml or llms.txt.`);
        }
        logger.info(`CSP: ${used.size} inline script hash(es) match vercel.json.`);
      },
    },
  };
}
