// Minimal static server over dist/ so the Playwright checks exercise real
// routes rather than file:// URLs.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const exists = async (p) => {
  try {
    return (await stat(p)).isFile();
  } catch {
    return false;
  }
};

export async function serveDist(dist, port = 4321) {
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const candidates = [
      join(dist, url),
      join(dist, `${url}.html`),
      join(dist, url, 'index.html'),
    ];

    for (const c of candidates) {
      if (await exists(c)) {
        const body = await readFile(c);
        res.writeHead(200, { 'content-type': TYPES[extname(c)] || 'application/octet-stream' });
        res.end(body);
        return;
      }
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    origin: `http://localhost:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}
