// JSON-LD, validated per route from the built HTML.
//
//   node scripts/check-schema.mjs            dist/
//   DIST=path node scripts/check-schema.mjs  another build
//
// Errors fail the check:
//   - not exactly one JSON-LD block, or it does not parse, or it is not one
//     @graph under the schema.org context;
//   - a node without @type, a duplicate or non-absolute @id, or an @id
//     reference that no page on the site defines;
//   - a property that is not in the schema.org vocabulary for that type, as
//     listed below (so a typo cannot pass);
//   - a type the site must not use: FAQPage, Review, AggregateRating,
//     LocalBusiness, ProfessionalService;
//   - [PLACEHOLDER], an empty value, or a relative URL anywhere;
//   - a required property missing for the type (Organization, WebSite,
//     WebPage, BreadcrumbList, Article, Service, Person, ImageObject), or a
//     value that disagrees with the page: the WebPage's url, name and
//     description against the canonical, <title> and meta description; the
//     last breadcrumb against the canonical; the Article author against the
//     visible byline.
// Warnings do not fail it: Google's recommended properties that are absent.
// datePublished and dateModified are absent by decision (no invented dates),
// so every Article reports them as an expected warning.
import { readFile, readdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES } from './routes.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = process.env.DIST ?? join(ROOT, 'dist');
const SITE = 'https://kaltech.online';

// schema.org properties the site uses, per type. Every one is a property of
// that type or of a type it inherits from (Thing, CreativeWork, MediaObject).
const VOCAB = {
  Organization: ['name', 'legalName', 'url', 'email', 'description', 'address', 'logo', 'sameAs'],
  PostalAddress: ['addressRegion', 'addressCountry'],
  ImageObject: ['url', 'contentUrl', 'width', 'height'],
  WebSite: ['url', 'name', 'description', 'publisher', 'inLanguage'],
  WebPage: ['url', 'name', 'description', 'isPartOf', 'publisher', 'inLanguage', 'breadcrumb'],
  BreadcrumbList: ['itemListElement'],
  ListItem: ['position', 'name', 'item'],
  Article: ['headline', 'description', 'articleSection', 'inLanguage', 'image', 'author', 'publisher', 'mainEntityOfPage', 'isPartOf'],
  Person: ['name', 'worksFor'],
  Service: ['name', 'description', 'url', 'provider'],
};
const REQUIRED = {
  Organization: ['name', 'url', 'logo', 'legalName', 'email', 'address', 'description'],
  WebSite: ['url', 'name', 'publisher'],
  WebPage: ['url', 'name', 'description', 'isPartOf'],
  BreadcrumbList: ['itemListElement'],
  Article: ['headline', 'image', 'author', 'publisher', 'mainEntityOfPage'],
  Service: ['name', 'description', 'provider'],
  Person: ['name', 'worksFor'],
  ImageObject: ['url'],
};
const FORBIDDEN = ['FAQPage', 'Review', 'AggregateRating', 'LocalBusiness', 'ProfessionalService'];
const ARTICLE_PAGES = ['/work/kalpay', '/work/ahw-global', '/work/becs', '/insights/retrieval-versus-fine-tuning'];

const file = (route) => join(DIST, route === '/' ? 'index.html' : route.slice(1) + '/index.html');
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const isRef = (v) => v && typeof v === 'object' && Object.keys(v).length === 1 && '@id' in v;

const pages = [];
for (const route of [...ROUTES, '/404']) {
  const f = route === '/404' ? join(DIST, '404.html') : file(route);
  const html = await readFile(f, 'utf8');
  pages.push({ route, html });
}

// Every @id defined anywhere on the site, for cross-page references.
const defined = new Map();
const parsed = new Map();
for (const p of pages) {
  const blocks = [...p.html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  let data = null;
  let parseError = null;
  try {
    data = blocks.length === 1 ? JSON.parse(blocks[0]) : null;
  } catch (e) {
    parseError = e.message;
  }
  parsed.set(p.route, { blocks: blocks.length, data, parseError });
  for (const n of data?.['@graph'] ?? []) {
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (o['@id'] && !isRef(o)) defined.set(o['@id'], o['@type']);
      Object.values(o).forEach(walk);
    };
    walk(n);
  }
}

const report = [];
for (const p of pages) {
  const errors = [];
  const warnings = [];
  const { blocks, data, parseError } = parsed.get(p.route);
  const meta = (name) => decode(p.html.match(new RegExp(`<meta[^>]*name="${name}"[^>]*content="([^"]*)"`))?.[1] ?? '');
  const title = decode(p.html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '');
  const canonical = p.html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? null;
  const types = [];

  if (blocks !== 1) errors.push(`${blocks} JSON-LD blocks; expected 1`);
  if (parseError) errors.push(`does not parse: ${parseError}`);
  if (data) {
    if (data['@context'] !== 'https://schema.org') errors.push(`@context is ${data['@context']}`);
    if (!Array.isArray(data['@graph'])) errors.push('no @graph array');
    const ids = new Set();
    const nodes = data['@graph'] ?? [];

    const visit = (o, type, path) => {
      if (Array.isArray(o)) return o.forEach((x, i) => visit(x, type, `${path}[${i}]`));
      if (o === null || o === undefined || o === '') return errors.push(`${path} is empty`);
      if (typeof o === 'string') {
        if (o.includes('[PLACEHOLDER]')) errors.push(`${path} is [PLACEHOLDER]`);
        return;
      }
      if (typeof o !== 'object') return;
      if (isRef(o)) {
        if (!defined.has(o['@id'])) errors.push(`${path} references ${o['@id']}, which no page defines`);
        return;
      }
      const t = o['@type'];
      if (!t) return errors.push(`${path} has no @type`);
      types.push(t);
      if (FORBIDDEN.includes(t)) errors.push(`${path} is a ${t}, which the site does not use`);
      if (!VOCAB[t]) errors.push(`${path}: type ${t} is not in the checked vocabulary`);
      if (o['@id']) {
        if (!o['@id'].startsWith(`${SITE}/`)) errors.push(`${path} @id ${o['@id']} is not an absolute kaltech.online URL`);
        if (ids.has(o['@id'])) errors.push(`duplicate @id ${o['@id']}`);
        ids.add(o['@id']);
      }
      for (const k of Object.keys(o)) {
        if (k.startsWith('@')) continue;
        if (VOCAB[t] && !VOCAB[t].includes(k)) errors.push(`${path}.${k} is not a ${t} property in the checked vocabulary`);
      }
      for (const k of REQUIRED[t] ?? []) if (o[k] === undefined) errors.push(`${t} is missing ${k}`);
      for (const k of ['url', 'item', 'contentUrl']) {
        if (typeof o[k] === 'string' && !/^https:\/\//.test(o[k])) errors.push(`${path}.${k} is not absolute: ${o[k]}`);
      }
      for (const [k, v] of Object.entries(o)) if (!k.startsWith('@')) visit(v, t, `${path}.${k}`);
    };
    nodes.forEach((n, i) => visit(n, null, `@graph[${i}]`));

    const byType = (t) => nodes.filter((n) => n['@type'] === t);
    const org = byType('Organization');
    if (org.length !== 1) errors.push(`${org.length} Organization nodes`);
    else {
      const o = org[0];
      if (o['@id'] !== `${SITE}/#organization`) errors.push(`Organization @id ${o['@id']}`);
      if (o.legalName !== 'AajKal Inc.') errors.push(`legalName ${o.legalName}`);
      if (o.address?.addressRegion !== 'DE' || o.address?.addressCountry !== 'US') errors.push('address is not DE, US');
      if (o.email !== 'info@kaltech.online') errors.push(`email ${o.email}`);
      if (JSON.stringify(o.sameAs) !== JSON.stringify(['https://www.linkedin.com/company/kal-tech'])) errors.push(`sameAs ${JSON.stringify(o.sameAs)}`);
      if (o.logo?.url) {
        const logoPath = new URL(o.logo.url).pathname;
        if (!(await access(join(DIST, logoPath)).then(() => true, () => false))) errors.push(`logo ${logoPath} is not in the build`);
      }
    }

    if (p.route === '/404') {
      if (nodes.length !== 1) errors.push('the 404 carries more than the Organization');
    } else {
      const site = byType('WebSite');
      if (p.route === '/' ? site.length !== 1 : site.length !== 0) errors.push(`${site.length} WebSite nodes`);
      const page = byType('WebPage');
      if (page.length !== 1) errors.push(`${page.length} WebPage nodes`);
      else {
        const w = page[0];
        if (w.url !== canonical) errors.push(`WebPage url ${w.url} is not the canonical ${canonical}`);
        if (w['@id'] !== `${canonical}#webpage`) errors.push(`WebPage @id ${w['@id']}`);
        if (w.name !== title) errors.push('WebPage name is not the <title>');
        if (w.description !== meta('description')) errors.push('WebPage description is not the meta description');
        if (p.route !== '/' && w.breadcrumb?.['@id'] !== `${canonical}#breadcrumb`) errors.push('WebPage does not reference its breadcrumb');
      }
      const crumbs = byType('BreadcrumbList');
      if (p.route === '/' ? crumbs.length !== 0 : crumbs.length !== 1) errors.push(`${crumbs.length} BreadcrumbList nodes`);
      if (crumbs.length === 1) {
        const items = crumbs[0].itemListElement ?? [];
        items.forEach((it, i) => {
          if (it.position !== i + 1) errors.push(`breadcrumb item ${i} has position ${it.position}`);
          if (!it.name) errors.push(`breadcrumb item ${i + 1} has no name`);
        });
        if (items[0]?.item !== `${SITE}/`) errors.push('first breadcrumb is not the homepage');
        if (items.at(-1)?.item !== canonical) errors.push(`last breadcrumb ${items.at(-1)?.item} is not the canonical`);
      }
      const articles = byType('Article');
      if (ARTICLE_PAGES.includes(p.route) ? articles.length !== 1 : articles.length !== 0) errors.push(`${articles.length} Article nodes`);
      for (const a of articles) {
        if (a.mainEntityOfPage?.['@id'] !== `${canonical}#webpage`) errors.push('Article mainEntityOfPage is not this page');
        if (a.publisher?.['@id'] !== `${SITE}/#organization`) errors.push('Article publisher is not the Organization');
        if (a.headline && a.headline.length > 110) warnings.push(`headline is ${a.headline.length} characters; Google shows up to 110`);
        const byline = p.html.match(/<p class="[^"]*art-byline[^"]*">([^<&]+)/)?.[1]?.trim() ?? null;
        if (byline) {
          if (a.author?.['@type'] !== 'Person' || a.author.name !== byline) errors.push(`Article author does not match the byline "${byline}"`);
          if (a.author?.worksFor?.['@id'] !== `${SITE}/#organization`) errors.push('Person does not work for the Organization');
        } else if (a.author?.['@id'] !== `${SITE}/#organization`) {
          errors.push('Article without a byline: the author should be the Organization');
        }
        if (a.image?.url && !(await access(join(DIST, new URL(a.image.url).pathname)).then(() => true, () => false))) errors.push('Article image is not in the build');
        for (const k of ['datePublished', 'dateModified']) if (!(k in a)) warnings.push(`${k} absent (expected: no dates, by decision)`);
      }
      const services = byType('Service');
      if (p.route === '/services' ? services.length !== 3 : services.length !== 0) errors.push(`${services.length} Service nodes`);
    }
  }
  report.push({ route: p.route, types: [...new Set(types)], errors, warnings });
}

console.log(`STRUCTURED DATA: one @graph per page, validated from ${DIST.replace(ROOT, '') || DIST}\n`);
console.log('  ' + 'route'.padEnd(42) + 'errors'.padEnd(8) + 'warnings'.padEnd(10) + 'types');
for (const r of report) {
  console.log('  ' + r.route.padEnd(42) + String(r.errors.length).padEnd(8) + String(r.warnings.length).padEnd(10) + r.types.join(', '));
}
const withIssues = report.filter((r) => r.errors.length || r.warnings.length);
if (withIssues.length) {
  console.log('');
  for (const r of withIssues) {
    for (const e of r.errors) console.log(`  ERROR    ${r.route}: ${e}`);
    const grouped = [...new Set(r.warnings)];
    for (const w of grouped) console.log(`  warning  ${r.route}: ${w}`);
  }
}
console.log('\n  Production URLs for Google\'s Rich Results Test (https://search.google.com/test/rich-results):');
for (const route of ROUTES) console.log(`    ${SITE}${route === '/' ? '/' : route}`);
const errors = report.reduce((n, r) => n + r.errors.length, 0);
console.log(errors ? `\nRESULT: FAIL (${errors} errors)` : '\nRESULT: PASS (0 errors)');
process.exit(errors ? 1 : 0);
