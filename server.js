/* Zero-dependency static server + feedback collector for Pocket School.
   Run: node server.js   (then open http://localhost:8080) */
const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

const MAX_BODY_BYTES = 16 * 1024;
const LIMITS = { topic: 80, name: 80, message: 4000, context: 600, meta: 300 };
const RATE = { windowMs: 10 * 60 * 1000, max: 5 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json'
};

/* ---------- helpers ---------- */

const hits = new Map();

function rateLimited(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < RATE.windowMs);
  if (list.length >= RATE.max) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}

function clean(value, max) {
  if (typeof value !== 'string') return '';
  // strip control characters other than newline and tab
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  res.end(body);
}

function isLoopback(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// serialize writes so concurrent submissions cannot interleave
let writeChain = Promise.resolve();

function appendFeedback(entry) {
  writeChain = writeChain.then(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    let list = [];
    try {
      list = JSON.parse(await fsp.readFile(FEEDBACK_FILE, 'utf8'));
      if (!Array.isArray(list)) list = [];
    } catch {
      list = [];
    }
    list.push(entry);
    const tmp = FEEDBACK_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
    await fsp.rename(tmp, FEEDBACK_FILE);
  });
  return writeChain;
}

/* ---------- routes ---------- */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleFeedback(req, res) {
  if (rateLimited(req.socket.remoteAddress || 'unknown')) {
    return json(res, 429, { ok: false, error: 'Too many submissions. Try again later.' });
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return json(res, 413, { ok: false, error: 'Message too large.' });
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(res, 400, { ok: false, error: 'Invalid request.' });
  }

  const message = clean(data.message, LIMITS.message);
  if (!message) return json(res, 400, { ok: false, error: 'Message is required.' });

  const entry = {
    id: crypto.randomUUID(),
    receivedAt: new Date().toISOString(),
    topic: clean(data.topic, LIMITS.topic) || 'General feedback',
    name: clean(data.name, LIMITS.name),
    message,
    context: clean(data.context, LIMITS.context),
    meta: clean(data.meta, LIMITS.meta)
  };

  try {
    await appendFeedback(entry);
  } catch (err) {
    console.error('feedback write failed:', err.message);
    return json(res, 500, { ok: false, error: 'Could not save feedback.' });
  }

  console.log(`[feedback] ${entry.topic} — ${entry.name || 'anonymous'}: ${entry.message.slice(0, 80)}`);
  return json(res, 201, { ok: true, id: entry.id });
}

async function handleList(req, res) {
  const token = req.headers['x-admin-token'] || '';
  const allowed = ADMIN_TOKEN ? token === ADMIN_TOKEN : isLoopback(req);
  if (!allowed) return json(res, 403, { ok: false, error: 'Forbidden.' });
  try {
    const list = JSON.parse(await fsp.readFile(FEEDBACK_FILE, 'utf8'));
    return json(res, 200, { ok: true, count: list.length, entries: list });
  } catch {
    return json(res, 200, { ok: true, count: 0, entries: [] });
  }
}

async function serveStatic(req, res, pathname) {
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const filePath = path.join(ROOT, rel);
  // block path traversal and direct access to collected feedback
  if (!filePath.startsWith(ROOT + path.sep) || path.resolve(filePath) === FEEDBACK_FILE) {
    res.writeHead(404).end('Not found');
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw new Error('not a file');
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'content-length': stat.size,
      'x-content-type-options': 'nosniff'
    });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

/* ---------- server ---------- */

const server = http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (pathname === '/api/feedback') {
    if (req.method === 'POST') return handleFeedback(req, res);
    if (req.method === 'GET') return handleList(req, res);
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { ok: false, error: 'Method not allowed.' });
  }

  return serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log(`Pocket School running at http://localhost:${PORT}`);
  console.log(`Feedback is appended to ${path.relative(ROOT, FEEDBACK_FILE)}`);
});
