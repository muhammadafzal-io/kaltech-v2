// 410 Gone, for old-site URLs that have no successor on this site.
//
// vercel.json rewrites them here, because a Vercel redirect cannot answer 410.
// The list is in docs/redirects.md; today it is the old pitch deck PDF. Like
// api/contact, this deploys as a Vercel function and does not run in the
// file:// review build.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(410).send(
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Page not found | KalTech</title></head>' +
      '<body><h1>There is no page at this address.</h1><ul><li><a href="/work">Work</a></li><li><a href="/services">Services</a></li><li><a href="/">Home</a></li></ul></body></html>'
  );
}
