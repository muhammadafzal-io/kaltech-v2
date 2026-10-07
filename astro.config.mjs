import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';
import seo from './src/integrations/seo.mjs';

// SITE_ENV is read here the same way astro:env reads it for the pages (the
// shell first, then any .env file), so the pages and the crawl-control files
// always describe the same build. Unset means preview.
const SITE_ENV = loadEnv('production', process.cwd(), '').SITE_ENV || 'preview';

// Static output, no UI framework. Deploys to Vercel as static.
//
// URLs: trailingSlash 'never' with the directory format, so /work is built as
// work/index.html and served at /work. The canonical, the sitemap <loc>, every
// internal link and the URL that answers 200 are the same string. Vercel's
// cleanUrls serves the directory index without a redirect; a trailing slash is
// a 301 in vercel.json (docs/redirects.md).
export default defineConfig({
  site: 'https://kaltech.online',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'directory',
    inlineStylesheets: 'auto',
  },
  env: {
    schema: {
      SITE_ENV: envField.enum({
        context: 'server',
        access: 'public',
        values: ['preview', 'production'],
        default: 'preview',
      }),
      // Search Console and Bing Webmaster Tools. Emitted only when set.
      GOOGLE_SITE_VERIFICATION: envField.string({ context: 'server', access: 'public', optional: true }),
      BING_SITE_VERIFICATION: envField.string({ context: 'server', access: 'public', optional: true }),
    },
  },
  integrations: [seo({ mode: SITE_ENV })],
  devToolbar: { enabled: false },
});
