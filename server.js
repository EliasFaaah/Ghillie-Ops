import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';

const PORT = Number(process.env.GHILLIE_PORT || 8790);
const ROOT = resolve(import.meta.dirname);
const MODELS = resolve(ROOT, '..', 'Models', 'GhillieOps');
const SIGNATURE = 'ghillie-ops';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

function locate(pathname) {
  const isModel = pathname === '/models' || pathname.startsWith('/models/');
  const base = isModel ? MODELS : ROOT;
  const rel = isModel ? pathname.slice('/models'.length) : pathname;
  const file = resolve(base, '.' + (rel.endsWith('/') || rel === '' ? rel + 'index.html' : rel));
  return file === base || file.startsWith(base + sep) ? file : null;
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { return send(res, 400, 'Bad request'); }
  if (pathname === '/__ghillieops') return send(res, 200, JSON.stringify({ app: SIGNATURE, root: ROOT, models: MODELS }), MIME['.json']);
  const file = locate(pathname);
  if (!file) return send(res, 403, 'Forbidden');
  let st;
  try { st = statSync(file); } catch { return send(res, 404, `Not found: ${pathname}`); }
  if (!st.isFile()) return send(res, 404, `Not found: ${pathname}`);
  const etag = `"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff'
  };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).on('error', () => res.destroy()).pipe(res);
});

server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is already in use.` : e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => console.log(`Ghillie Ops server on http://localhost:${PORT} (models: ${MODELS})`));
