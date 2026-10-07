// src/data/lastmod.json: the sitemap's <lastmod>, recorded where it is reliable.
//
// Only content files stand behind a single page (src/content/work/*.md and
// src/content/insights/*.md), so only those pages get a lastmod. The date is
// the file's modification time on this machine, recorded with a hash of its
// bytes. A build server's copy has no reliable modification time, so the
// production build reads this record instead, and uses a date only while the
// file's bytes still match it. Edit a case study or article, then run
// `npm run lastmod`. If you forget, that page's lastmod is left out, never wrong.
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'src/data/lastmod.json');
const previous = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{}')).files ?? {};

const files = {};
for (const collection of ['work', 'insights']) {
  const dir = join(ROOT, 'src/content', collection);
  for (const name of (await readdir(dir)).filter((n) => n.endsWith('.md')).sort()) {
    const rel = `src/content/${collection}/${name}`;
    const bytes = await readFile(join(dir, name));
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    // Unchanged bytes keep their recorded date, so re-running is harmless.
    const lastmod =
      previous[rel]?.sha256 === sha256
        ? previous[rel].lastmod
        : (await stat(join(dir, name))).mtime.toISOString().slice(0, 10);
    files[rel] = { sha256, lastmod };
  }
}

await writeFile(
  OUT,
  JSON.stringify(
    {
      _about:
        'Written by npm run lastmod. The sitemap uses a date only while the file still hashes to the value recorded with it. Unpublished articles are recorded too; they have no page, so no sitemap entry.',
      files,
    },
    null,
    2
  ) + '\n'
);
for (const [rel, { lastmod }] of Object.entries(files)) console.log(`  ${lastmod}  ${rel}`);
