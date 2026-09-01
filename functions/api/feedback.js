const LIMITS = { topic: 80, name: 80, message: 4000, context: 600, meta: 300 };
const RATE = { windowMs: 10 * 60 * 1000, max: 5 };

function clean(value, max) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}

function response(payload, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'cache-control': 'no-store' }
  });
}

async function authorized(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_TOKEN || !token) return false;
  const encoder = new TextEncoder();
  const [received, expected] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(token)),
    crypto.subtle.digest('SHA-256', encoder.encode(env.ADMIN_TOKEN))
  ]);
  return crypto.subtle.timingSafeEqual(received, expected);
}

async function hash(value, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${value}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!sameOrigin(request)) return response({ ok: false, error: 'Invalid origin.' }, 403);

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16 * 1024) return response({ ok: false, error: 'Message too large.' }, 413);

  let data;
  try {
    data = await request.json();
  } catch {
    return response({ ok: false, error: 'Invalid request.' }, 400);
  }

  const message = clean(data.message, LIMITS.message);
  if (!message) return response({ ok: false, error: 'Message is required.' }, 400);

  const submittedAt = Date.now();
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const ipHash = await hash(ip, env.FEEDBACK_IP_SALT || 'development-only-salt');
  const cutoff = submittedAt - RATE.windowMs;

  const rate = await env.FEEDBACK_DB.prepare(
    'SELECT COUNT(*) AS count FROM feedback_rate_limits WHERE ip_hash = ? AND submitted_at > ?'
  ).bind(ipHash, cutoff).first();
  if (Number(rate?.count || 0) >= RATE.max) {
    return response({ ok: false, error: 'Too many submissions. Try again later.' }, 429);
  }

  const id = crypto.randomUUID();
  const entry = {
    id,
    receivedAt: new Date(submittedAt).toISOString(),
    topic: clean(data.topic, LIMITS.topic) || 'General feedback',
    name: clean(data.name, LIMITS.name),
    message,
    context: clean(data.context, LIMITS.context),
    meta: clean(data.meta, LIMITS.meta)
  };

  try {
    await env.FEEDBACK_DB.batch([
      env.FEEDBACK_DB.prepare(
        `INSERT INTO feedback (id, received_at, topic, name, message, context, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(entry.id, entry.receivedAt, entry.topic, entry.name, entry.message, entry.context, entry.meta),
      env.FEEDBACK_DB.prepare(
        'INSERT INTO feedback_rate_limits (ip_hash, submitted_at) VALUES (?, ?)'
      ).bind(ipHash, submittedAt),
      env.FEEDBACK_DB.prepare('DELETE FROM feedback_rate_limits WHERE submitted_at <= ?').bind(cutoff)
    ]);
  } catch {
    return response({ ok: false, error: 'Could not save feedback.' }, 500);
  }

  return response({ ok: true, id }, 201);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await authorized(request, env))) return response({ ok: false, error: 'Forbidden.' }, 403);

  const { results } = await env.FEEDBACK_DB.prepare(
    'SELECT id, received_at AS receivedAt, topic, name, message, context, meta FROM feedback ORDER BY received_at DESC'
  ).all();
  return response({ ok: true, count: results.length, entries: results });
}
