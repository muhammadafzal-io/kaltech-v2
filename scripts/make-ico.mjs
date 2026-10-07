// public/favicon.ico, from public/favicon-32.png.
//
// Browsers and crawlers still ask for /favicon.ico by name, and the old site
// answered it. An ICO file may hold a PNG as-is, so this wraps the existing
// 32px icon in the six-byte header and one sixteen-byte directory entry: the
// same pixels, no second rendering. Run by `npm run favicon` after the PNGs.
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const png = await readFile(join(ROOT, 'public', 'favicon-32.png'));
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // one image

const entry = Buffer.alloc(16);
entry.writeUInt8(width >= 256 ? 0 : width, 0);
entry.writeUInt8(height >= 256 ? 0 : height, 1);
entry.writeUInt8(0, 2); // no palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // colour planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);

await writeFile(join(ROOT, 'public', 'favicon.ico'), Buffer.concat([header, entry, png]));
console.log(`  public/favicon.ico  ${width}×${height}, PNG inside ICO`);
