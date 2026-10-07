// POST /api/contact
//
// A stub for the contact form. It accepts the POST, logs the submitted fields
// and returns 200. Connect delivery (email, CRM, queue) inside `handler` later;
// the form markup in src/pages/contact.astro does not need to change.
//
// This deploys as a Vercel Serverless Function next to the static site. It is
// not part of the Astro build and does not run in the file:// review build.
// It logs what a visitor typed, including their name and email: replace the log
// with real delivery before this carries production traffic.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const body = await readBody(req);
  console.log('[contact]', JSON.stringify(body));
  return res.status(200).json({ ok: true });
}

// Vercel parses JSON and urlencoded bodies into req.body. A plain form POST is
// urlencoded; a raw stream or string body is parsed here as a fallback.
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw && typeof req[Symbol.asyncIterator] === 'function') {
    for await (const chunk of req) raw += chunk;
  }

  const type = String((req.headers && req.headers['content-type']) || '');
  if (type.includes('application/json')) {
    try {
      return JSON.parse(raw || '{}');
    } catch {
      return { unparsed: raw };
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}
