const LIMITS = { displayName: 24, score: 2900, mastered: 29, answerScore: 5, elapsed: 600000 };
const WINDOW_MS = 10 * 60 * 1000;
const BATTLE_TTL_MS = 24 * 60 * 60 * 1000;

function json(payload, status = 200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'no-store' } });
}

function clean(value, max) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, max)
    : '';
}

async function digest(value, salt) {
  const input = new TextEncoder().encode(`${salt}:${value}`);
  const output = await crypto.subtle.digest('SHA-256', input);
  return [...new Uint8Array(output)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

async function playerFromRequest(request, env) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || token.length < 32 || !env.SOCIAL_TOKEN_SALT) return null;
  const tokenHash = await digest(token, env.SOCIAL_TOKEN_SALT);
  return env.FEEDBACK_DB.prepare(
    'SELECT id, display_name, public_opt_in, overall_score, mastered_count, updated_at FROM players WHERE token_hash = ?'
  ).bind(tokenHash).first();
}

function profile(player, relation = 'none') {
  return {
    id: player.id,
    displayName: player.display_name,
    score: player.overall_score,
    mastered: player.mastered_count,
    updatedAt: player.updated_at,
    relation
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function validScore(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

async function relations(env, currentId, ids) {
  if (!ids.length) return new Map();
  const marks = ids.map(() => '?').join(', ');
  const { results } = await env.FEEDBACK_DB.prepare(
    `SELECT sender_id, recipient_id, status FROM friend_requests
     WHERE (sender_id = ? AND recipient_id IN (${marks}))
        OR (recipient_id = ? AND sender_id IN (${marks}))`
  ).bind(currentId, ...ids, currentId, ...ids).all();
  const output = new Map();
  for (const row of results) {
    const otherId = row.sender_id === currentId ? row.recipient_id : row.sender_id;
    output.set(otherId, row.status === 'accepted' ? 'friends' : row.sender_id === currentId ? 'outgoing' : 'incoming');
  }
  return output;
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) {
    return json({ ok: false, error: 'Invalid origin.' }, 403);
  }
  const action = (params.path || []).join('/');
  const data = await readJson(request);
  if (!data) return json({ ok: false, error: 'Invalid request.' }, 400);
  const now = Date.now();

  if (action === 'profile') {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const displayName = clean(data.displayName, LIMITS.displayName);
    if (!token || token.length < 32 || !displayName) return json({ ok: false, error: 'Choose a display name.' }, 400);
    if (!env.SOCIAL_TOKEN_SALT) return json({ ok: false, error: 'Social profiles are not configured yet.' }, 503);
    if (!validScore(data.score, LIMITS.score) || !validScore(data.mastered, LIMITS.mastered)) {
      return json({ ok: false, error: 'Invalid progress data.' }, 400);
    }
    const tokenHash = await digest(token, env.SOCIAL_TOKEN_SALT);
    const existing = await env.FEEDBACK_DB.prepare('SELECT id FROM players WHERE token_hash = ?').bind(tokenHash).first();
    const id = existing?.id || crypto.randomUUID();
    await env.FEEDBACK_DB.prepare(
      `INSERT INTO players (id, token_hash, display_name, public_opt_in, overall_score, mastered_count, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(token_hash) DO UPDATE SET display_name = excluded.display_name, public_opt_in = excluded.public_opt_in,
         overall_score = excluded.overall_score, mastered_count = excluded.mastered_count, updated_at = excluded.updated_at`
    ).bind(id, tokenHash, displayName, data.publicOptIn ? 1 : 0, data.score, data.mastered, now, now).run();
          const snapshotDate = new Date(now).toISOString().slice(0, 10);
          await env.FEEDBACK_DB.prepare(
         `INSERT INTO player_progress (player_id, snapshot_date, overall_score, mastered_count, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(player_id, snapshot_date) DO UPDATE SET overall_score = excluded.overall_score,
            mastered_count = excluded.mastered_count, updated_at = excluded.updated_at`
          ).bind(id, snapshotDate, data.score, data.mastered, now).run();
    return json({ ok: true, player: { id, displayName, score: data.score, mastered: data.mastered, publicOptIn: Boolean(data.publicOptIn) } });
  }

  const current = await playerFromRequest(request, env);
  if (!current) return json({ ok: false, error: 'Create your optional player profile first.' }, 401);

  if (action === 'friends/request') {
    const recipientId = clean(data.playerId, 64);
    if (!recipientId || recipientId === current.id) return json({ ok: false, error: 'Choose another player.' }, 400);
    const recipient = await env.FEEDBACK_DB.prepare('SELECT id, public_opt_in FROM players WHERE id = ?').bind(recipientId).first();
    if (!recipient?.public_opt_in) return json({ ok: false, error: 'That player is not available.' }, 404);
    const reverse = await env.FEEDBACK_DB.prepare('SELECT id, status FROM friend_requests WHERE sender_id = ? AND recipient_id = ?').bind(recipientId, current.id).first();
    if (reverse?.status === 'pending') {
      await env.FEEDBACK_DB.prepare("UPDATE friend_requests SET status = 'accepted', updated_at = ? WHERE id = ?").bind(now, reverse.id).run();
      return json({ ok: true, relation: 'friends' });
    }
    await env.FEEDBACK_DB.prepare(
      `INSERT INTO friend_requests (id, sender_id, recipient_id, status, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(sender_id, recipient_id) DO UPDATE SET status = 'pending', updated_at = excluded.updated_at`
    ).bind(crypto.randomUUID(), current.id, recipientId, now, now).run();
    return json({ ok: true, relation: 'outgoing' });
  }

  if (action === 'friends/respond') {
    const requestId = clean(data.requestId, 64);
    const status = data.accept ? 'accepted' : 'declined';
    const update = await env.FEEDBACK_DB.prepare(
      "UPDATE friend_requests SET status = ?, updated_at = ? WHERE id = ? AND recipient_id = ? AND status = 'pending'"
    ).bind(status, now, requestId, current.id).run();
    return update.meta.changes ? json({ ok: true, relation: status === 'accepted' ? 'friends' : 'none' }) : json({ ok: false, error: 'Request is no longer available.' }, 404);
  }

  if (action === 'battles/create') {
    const opponentId = clean(data.playerId, 64);
    if (!opponentId || opponentId === current.id) return json({ ok: false, error: 'Choose another player.' }, 400);
    const relation = await relations(env, current.id, [opponentId]);
    if (relation.get(opponentId) !== 'friends') return json({ ok: false, error: 'Battles are available to friends only.' }, 403);
    const battle = { id: crypto.randomUUID(), seed: crypto.randomUUID(), expiresAt: now + BATTLE_TTL_MS };
    await env.FEEDBACK_DB.prepare(
      `INSERT INTO battles (id, inviter_id, opponent_id, status, question_seed, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    ).bind(battle.id, current.id, opponentId, battle.seed, now, battle.expiresAt).run();
    return json({ ok: true, battle });
  }

  if (action === 'battles/respond') {
    const battleId = clean(data.battleId, 64);
    const battle = await env.FEEDBACK_DB.prepare('SELECT * FROM battles WHERE id = ? AND opponent_id = ?').bind(battleId, current.id).first();
    if (!battle || battle.status !== 'pending' || battle.expires_at < now) return json({ ok: false, error: 'Battle is no longer available.' }, 404);
    const status = data.accept ? 'active' : 'declined';
    await env.FEEDBACK_DB.prepare('UPDATE battles SET status = ?, started_at = ? WHERE id = ?').bind(status, now, battleId).run();
    return json({ ok: true, battle: { id: battleId, status, seed: battle.question_seed, startedAt: now } });
  }

  if (action === 'battles/submit') {
    const battleId = clean(data.battleId, 64);
    if (!validScore(data.score, LIMITS.answerScore) || !validScore(data.elapsedMs, LIMITS.elapsed)) return json({ ok: false, error: 'Invalid battle result.' }, 400);
    const battle = await env.FEEDBACK_DB.prepare('SELECT * FROM battles WHERE id = ? AND (inviter_id = ? OR opponent_id = ?)').bind(battleId, current.id, current.id).first();
    if (!battle || battle.status !== 'active') return json({ ok: false, error: 'Battle is not active.' }, 404);
    const side = battle.inviter_id === current.id ? 'inviter' : 'opponent';
    if (battle[`${side}_score`] !== null) return json({ ok: false, error: 'Battle result already submitted.' }, 409);
    const complete = battle[side === 'inviter' ? 'opponent_score' : 'inviter_score'] !== null;
    if (!complete) {
      await env.FEEDBACK_DB.prepare(
        `UPDATE battles SET ${side}_score = ?, ${side}_elapsed_ms = ? WHERE id = ?`
      ).bind(data.score, data.elapsedMs, battleId).run();
      return json({ ok: true, waiting: true });
    }
    const inviterScore = side === 'inviter' ? data.score : battle.inviter_score;
    const inviterElapsed = side === 'inviter' ? data.elapsedMs : battle.inviter_elapsed_ms;
    const opponentScore = side === 'opponent' ? data.score : battle.opponent_score;
    const opponentElapsed = side === 'opponent' ? data.elapsedMs : battle.opponent_elapsed_ms;
    const compare = inviterScore === opponentScore ? inviterElapsed - opponentElapsed : opponentScore - inviterScore;
    const inviterResult = compare < 0 ? 'win' : compare > 0 ? 'loss' : 'tie';
    const opponentResult = inviterResult === 'win' ? 'loss' : inviterResult === 'loss' ? 'win' : 'tie';
    await env.FEEDBACK_DB.batch([
      env.FEEDBACK_DB.prepare(
        `INSERT INTO battle_history (id, player_id, opponent_id, result, player_score, opponent_score, player_elapsed_ms, opponent_elapsed_ms, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), battle.inviter_id, battle.opponent_id, inviterResult, inviterScore, opponentScore, inviterElapsed, opponentElapsed, now),
      env.FEEDBACK_DB.prepare(
        `INSERT INTO battle_history (id, player_id, opponent_id, result, player_score, opponent_score, player_elapsed_ms, opponent_elapsed_ms, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(crypto.randomUUID(), battle.opponent_id, battle.inviter_id, opponentResult, opponentScore, inviterScore, opponentElapsed, inviterElapsed, now),
      env.FEEDBACK_DB.prepare('DELETE FROM battles WHERE id = ?').bind(battleId)
    ]);
    return json({ ok: true, waiting: false });
  }

  return json({ ok: false, error: 'Unknown action.' }, 404);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const current = await playerFromRequest(request, env);
  if (!current) return json({ ok: false, error: 'Create your optional player profile first.' }, 401);
  const action = (params.path || []).join('/');

  if (action === 'nearby') {
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT id, display_name, overall_score, mastered_count, updated_at FROM players
       WHERE public_opt_in = 1 AND id != ? ORDER BY ABS(overall_score - ?) ASC, updated_at DESC LIMIT 12`
    ).bind(current.id, current.overall_score).all();
    const rel = await relations(env, current.id, results.map((p) => p.id));
    return json({ ok: true, player: profile(current), players: results.map((p) => profile(p, rel.get(p.id) || 'none')) });
  }

  if (action === 'friends') {
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT r.id AS request_id, r.status, r.sender_id, r.recipient_id, p.display_name, p.overall_score, p.mastered_count, p.updated_at
       FROM friend_requests r JOIN players p ON p.id = CASE WHEN r.sender_id = ? THEN r.recipient_id ELSE r.sender_id END
       WHERE r.sender_id = ? OR r.recipient_id = ? ORDER BY r.updated_at DESC`
    ).bind(current.id, current.id, current.id).all();
    return json({ ok: true, friends: results.map((r) => ({ requestId: r.request_id, relation: r.status === 'accepted' ? 'friends' : r.sender_id === current.id ? 'outgoing' : 'incoming', player: { id: r.sender_id === current.id ? r.recipient_id : r.sender_id, displayName: r.display_name, score: r.overall_score, mastered: r.mastered_count, updatedAt: r.updated_at } })) });
  }

  if (action === 'history') {
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT snapshot_date AS snapshotDate, overall_score AS score, mastered_count AS mastered
       FROM player_progress WHERE player_id = ? ORDER BY snapshot_date DESC LIMIT 30`
    ).bind(current.id).all();
    return json({ ok: true, history: results.reverse() });
  }

  if (action === 'battle-history') {
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT h.result, h.player_score, h.opponent_score, h.player_elapsed_ms, h.opponent_elapsed_ms, h.completed_at, p.display_name
       FROM battle_history h JOIN players p ON p.id = h.opponent_id
       WHERE h.player_id = ? ORDER BY h.completed_at DESC LIMIT 30`
    ).bind(current.id).all();
    return json({ ok: true, history: results.map((item) => ({
      result: item.result,
      playerScore: item.player_score,
      opponentScore: item.opponent_score,
      playerElapsedMs: item.player_elapsed_ms,
      opponentElapsedMs: item.opponent_elapsed_ms,
      completedAt: item.completed_at,
      opponentName: item.display_name
    })) });
  }

  if (action === 'rankings') {
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT id, display_name, overall_score, mastered_count, updated_at FROM players
       WHERE public_opt_in = 1 ORDER BY overall_score DESC, mastered_count DESC, updated_at ASC LIMIT 50`
    ).all();
    return json({ ok: true, players: results.map((player, index) => ({ ...profile(player), rank: index + 1 })) });
  }

  if (action === 'battles') {
    const now = Date.now();
    await env.FEEDBACK_DB.prepare(
      "DELETE FROM battles WHERE status = 'declined' OR ((status = 'pending' OR status = 'active') AND expires_at < ?)"
    ).bind(now).run();
    const { results } = await env.FEEDBACK_DB.prepare(
      `SELECT b.*, i.display_name AS inviter_name, o.display_name AS opponent_name
       FROM battles b JOIN players i ON i.id = b.inviter_id JOIN players o ON o.id = b.opponent_id
      WHERE (b.inviter_id = ? OR b.opponent_id = ?) AND (b.status = 'pending' OR b.status = 'active') ORDER BY b.created_at DESC LIMIT 25`
    ).bind(current.id, current.id).all();
    return json({ ok: true, battles: results.map((b) => ({
      id: b.id, status: b.status, seed: b.question_seed, createdAt: b.created_at, startedAt: b.started_at, expiresAt: b.expires_at,
      role: b.inviter_id === current.id ? 'inviter' : 'opponent',
      opponent: b.inviter_id === current.id ? { id: b.opponent_id, displayName: b.opponent_name } : { id: b.inviter_id, displayName: b.inviter_name },
      mine: b.inviter_id === current.id ? { score: b.inviter_score, elapsedMs: b.inviter_elapsed_ms } : { score: b.opponent_score, elapsedMs: b.opponent_elapsed_ms },
      theirs: b.inviter_id === current.id ? { score: b.opponent_score, elapsedMs: b.opponent_elapsed_ms } : { score: b.inviter_score, elapsedMs: b.inviter_elapsed_ms }
    })) });
  }

  return json({ ok: false, error: 'Unknown action.' }, 404);
}
