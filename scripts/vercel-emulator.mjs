// A local stand-in for Vercel's edge, for the redirect and header checks.
//
// vercel.json is compiled by Vercel's own @vercel/routing-utils, the package
// Vercel uses to turn redirects, rewrites, headers and cleanUrls into routes,
// and the routes are run the way `vercel dev` runs them
// (packages/cli/src/util/dev/router.ts):
//   - `src` is matched case-insensitively against the raw, still-encoded path;
//   - routes before `handle: filesystem` run first: a matching redirect ends the
//     request, and header routes with `continue` add their headers;
//   - then the filesystem: the file itself, then <path>.html (cleanUrls), then
//     <path>/index.html (a directory's index, trailing slash ignored);
//   - then rewrites with `check`, which can land on a file or on a function in
//     api/;
//   - then 404.html, with status 404.
// `has`/`missing` conditions are matched as anchored regular expressions, as
// Next.js and Vercel document them.
//
// What it cannot show: Vercel's automatic http -> https 308, which happens
// before any of this. Run scripts/check-redirects.mjs with ORIGIN set to check
// a live deployment instead.
import { createServer, request as httpRequest } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getTransformedRoutes } from '@vercel/routing-utils';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const isFile = async (p) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

export async function loadRoutes(configPath = join(ROOT, 'vercel.json')) {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const { routes, error } = getTransformedRoutes(config);
  if (error) throw new Error(`vercel.json does not compile: ${error.message}`);
  const main = [];
  const rewrites = [];
  let phase = main;
  for (const r of routes) {
    if (r.handle === 'filesystem') {
      phase = rewrites;
      continue;
    }
    if (r.handle) continue;
    phase.push(r);
  }
  return { config, main, rewrites };
}

const conditionHolds = (cond, host) => {
  if (cond.type !== 'host') return false;
  if (cond.value === undefined) return true;
  return new RegExp(`^${cond.value}$`).test(host);
};
const applies = (route, host) =>
  (route.has ?? []).every((c) => conditionHolds(c, host)) && !(route.missing ?? []).some((c) => conditionHolds(c, host));

const subst = (str, m) => str.replace(/\$([1-9][0-9]*)/g, (_, n) => m[+n] ?? '');

async function fromFilesystem(dist, rawPath) {
  let path;
  try {
    path = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  const clean = path.replace(/^\/+/, '').replace(/\/+$/, '');
  const candidates = clean === '' ? ['index.html'] : [clean, `${clean}.html`, `${clean}/index.html`];
  for (const c of candidates) if (await isFile(join(dist, c))) return join(dist, c);
  return null;
}

async function runFunction(name, method) {
  const file = join(ROOT, 'api', `${name}.js`);
  if (!(await isFile(file))) return null;
  const { default: handler } = await import(pathToFileURL(file).href);
  const out = { status: 200, headers: {}, body: '' };
  const res = {
    setHeader: (k, v) => ((out.headers[k.toLowerCase()] = v), res),
    status: (s) => ((out.status = s), res),
    send: (b) => ((out.body = String(b)), res),
    json: (o) => ((out.headers['content-type'] = 'application/json'), (out.body = JSON.stringify(o)), res),
  };
  await handler({ method, headers: {}, body: null }, res);
  return out;
}

/** Resolve one request the way Vercel would. Returns { status, headers, body, file }. */
export async function resolve({ dist, routes, host, path: rawUrl, method = 'GET' }) {
  let path = rawUrl.split('?')[0] || '/';
  const headers = {};

  for (const r of routes.main) {
    const m = new RegExp(r.src, 'i').exec(path);
    if (!m || !applies(r, host)) continue;
    for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = subst(v, m);
    if (r.continue) {
      if (r.dest) path = subst(r.dest, m);
      continue;
    }
    if (r.status && headers.location) return { status: r.status, headers, body: '' };
    if (r.dest) path = subst(r.dest, m);
  }

  const hit = await fromFilesystem(dist, path);
  if (hit) return { status: 200, headers: { 'content-type': TYPES[extname(hit)] ?? 'application/octet-stream', ...headers }, file: hit };

  for (const r of routes.rewrites) {
    const m = new RegExp(r.src, 'i').exec(path);
    if (!m || !applies(r, host)) continue;
    path = subst(r.dest, m);
    const fn = path.match(/^\/api\/([\w-]+)$/);
    if (fn) {
      const out = await runFunction(fn[1], method);
      if (out) return { status: out.status, headers: { ...headers, ...out.headers }, body: out.body };
    }
    const file = await fromFilesystem(dist, path);
    if (file) return { status: 200, headers: { 'content-type': TYPES[extname(file)], ...headers }, file };
  }

  const notFound = join(dist, '404.html');
  return (await isFile(notFound))
    ? { status: 404, headers: { 'content-type': TYPES['.html'], ...headers }, file: notFound }
    : { status: 404, headers, body: 'NOT_FOUND' };
}

/** An HTTP server over `dist` that answers as Vercel would, per Host header. */
export async function serveVercel(dist, port = 4700) {
  const routes = await loadRoutes();
  const server = createServer(async (req, res) => {
    const host = String(req.headers.host ?? '').replace(/:\d+$/, '');
    const out = await resolve({ dist, routes, host, path: req.url ?? '/', method: req.method });
    res.writeHead(out.status, out.headers);
    res.end(out.file ? await readFile(out.file) : out.body);
  });
  await new Promise((r) => server.listen(port, r));
  return {
    port,
    origin: `http://localhost:${port}`,
    close: () => new Promise((r) => server.close(r)),
  };
}

/** One request to the emulator with a chosen Host header. No redirect is followed. */
export function get(port, host, path) {
  return new Promise((resolveReq, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, method: 'GET', headers: { host } }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolveReq({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}
