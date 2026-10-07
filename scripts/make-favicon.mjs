// The favicon is type-set from the real Sora file, exactly as the header
// wordmark is: paper K, accent period, on the deep ground. No brand PNG is
// used — all three have baked backgrounds. Colours are read from tokens.css so
// this script holds no colour literal of its own.
//
// Output: public/favicon-32.png, public/icon-512.png, public/apple-touch-icon.png,
// then public/favicon.ico wrapped from the 32px PNG (scripts/make-ico.mjs)
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tokens = await readFile(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const token = (name) => {
  const m = tokens.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`token --${name} not found`);
  return m[1].trim();
};

const ground = token('deep');
const letter = token('paper');
const dot = token('accent-dark');
// Embedded rather than linked: a page built with setContent has no base URL,
// so a file:// font never loads and the mark silently falls back to a serif.
const fontData = await readFile(join(ROOT, 'node_modules/@fontsource/sora/files/sora-latin-700-normal.woff2'));
const fontUrl = `data:font/woff2;base64,${fontData.toString('base64')}`;

await mkdir(join(ROOT, 'public'), { recursive: true });

const SIZES = [
  { file: 'favicon-32.png', px: 32 },
  { file: 'icon-512.png', px: 512 },
  { file: 'apple-touch-icon.png', px: 180 },
];

const browser = await chromium.launch();
for (const { file, px } of SIZES) {
  const page = await browser.newPage({ viewport: { width: px, height: px }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Sora; src: url('${fontUrl}') format('woff2'); font-weight: 700; }
    html, body { margin: 0; width: ${px}px; height: ${px}px; }
    body { background: ${ground}; display: flex; align-items: center; justify-content: center; }
    span { font-family: Sora; font-weight: 700; font-size: ${Math.round(px * 0.56)}px;
      letter-spacing: ${(-px * 0.02).toFixed(2)}px; color: ${letter}; line-height: 1;
      transform: translateY(${(-px * 0.01).toFixed(2)}px); }
    i { color: ${dot}; font-style: normal; }
  </style><span>K<i>.</i></span>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, 'public', file), omitBackground: false });
  await page.close();
  console.log(`  public/${file}  ${px}×${px}`);
}
// The share card: the wordmark alone, type-set on the deep ground with the
// hairline the site uses on dark. No strapline — no copy exists for one.
const rule = token('rule-dark');
const card = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await card.setContent(`<!doctype html><meta charset="utf-8"><style>
  @font-face { font-family: Sora; src: url('${fontUrl}') format('woff2'); font-weight: 700; }
  html, body { margin: 0; width: 1200px; height: 630px; }
  body { background: ${ground}; display: flex; align-items: center; justify-content: center; }
  div { border-top: 1px solid ${rule}; border-bottom: 1px solid ${rule}; padding: 64px 96px; }
  span { font-family: Sora; font-weight: 700; font-size: 92px; letter-spacing: -3.2px;
    color: ${letter}; line-height: 1; }
  i { color: ${dot}; font-style: normal; }
</style><div><span>KalTech<i>.</i></span></div>`);
await card.evaluate(() => document.fonts.ready);
await card.screenshot({ path: join(ROOT, 'public', 'og-card.png') });
await card.close();
console.log('  public/og-card.png  1200×630');

await browser.close();
await import('./make-ico.mjs');
