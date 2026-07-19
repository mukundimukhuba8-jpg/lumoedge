import { handleApi } from '../_lib/handlers.mjs';

export default async function handler(req, res) {
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/', `https://${host}`);
  // On Vercel catch-all, path may be /api/... already
  let pathname = url.pathname;
  if (!pathname.startsWith('/api')) {
    pathname = `/api${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
  }
  const handled = await handleApi(req, res, pathname);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found', path: pathname }));
  }
}
