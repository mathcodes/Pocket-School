/* Optional social profiles, nearby players, friends, and friendly speed battles. */
(function () {
  const TOKEN_KEY = 'pocket-school.player-token.v1';
  const PROFILE_KEY = 'pocket-school.player-profile.v1';
  const state = { profile: null, hub: 'nearby', battles: [], activeBattle: null };

  function token() {
    let value = localStorage.getItem(TOKEN_KEY);
    if (!value) {
      value = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(TOKEN_KEY, value);
    }
    return value;
  }

  function savedProfile() {
    try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null'); } catch { return null; }
  }

  function progress() {
    const scores = BQ.skills.map((skill) => Store.skill(skill.id).score);
    return {
      score: Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length),
      mastered: BQ.skills.filter((skill) => Store.skill(skill.id).mastered).length
    };
  }

  async function api(path, options = {}) {
    const response = await fetch(`api/social/${path}`, {
      ...options,
      headers: {
        authorization: `Bearer ${token()}`,
        'content-type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Unable to reach Player Hub.');
    return data;
  }

  function esc(value) {
    return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function openModal(id) {
    document.getElementById(id).hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    document.getElementById(id).hidden = true;
    document.body.classList.remove('modal-open');
  }

  function closeAll() {
    closeModal('socialModal');
    closeModal('battleModal');
  }

  function init() {
    document.getElementById('socialTop').onclick = openHub;
    document.getElementById('socialLink').onclick = openHub;
    document.querySelectorAll('[data-social-close], [data-battle-close]').forEach((button) => button.onclick = closeAll);
    document.getElementById('loginCreate').onclick = () => {
      dismissLogin();
      openHub();
    };
    document.getElementById('loginGuest').onclick = dismissLogin;
    document.querySelectorAll('[data-provider]').forEach((button) => {
      button.onclick = () => {
        document.getElementById('loginNote').textContent = `${button.dataset.provider} sign-in needs that provider's OAuth app configuration. Create a player account to use the Player Hub today.`;
      };
    });
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeAll(); });
    if (!savedProfile() && !sessionStorage.getItem('pocket-school.guest-session')) showLogin();
  }

  function showLogin() {
    document.getElementById('loginGate').hidden = false;
    document.body.classList.add('modal-open');
  }

  function dismissLogin() {
    document.getElementById('loginGate').hidden = true;
    document.body.classList.remove('modal-open');
    sessionStorage.setItem('pocket-school.guest-session', '1');
  }

  function openHub() {
    state.profile = savedProfile();
    openModal('socialModal');
    if (!state.profile) return renderEnroll();
    refreshHub();
  }

  function renderEnroll(error = '') {
    document.getElementById('socialBody').innerHTML = `
      <div class="social-intro">
        <span class="social-hero">🎱</span>
        <h4>Join the Player Hub</h4>
        <p class="muted">Optional. Create a display name to save your current progress, find players near your score,
          add friends, and send friendly five-question speed-battle invites.</p>
      </div>
      <label for="playerName">Display name</label>
      <input id="playerName" maxlength="24" autocomplete="nickname" placeholder="e.g. Corner Pocket" />
      <label class="check-row"><input id="publicProfile" type="checkbox" checked /> Let nearby players find my score</label>
      <p class="social-privacy">No email or real name is required. Your private device key stays in this browser.
        Only your chosen name, overall SmartScore, and mastered-skill count are shared.</p>
      ${error ? `<p class="fb-status warn">${esc(error)}</p>` : ''}
      <button class="primary-btn" id="createProfile">Create player profile</button>`;
    document.getElementById('createProfile').onclick = createProfile;
  }

  async function createProfile() {
    const displayName = document.getElementById('playerName').value.trim();
    if (!displayName) return renderEnroll('Choose a display name to continue.');
    const p = progress();
    try {
      const data = await api('profile', { method: 'POST', body: JSON.stringify({ displayName, publicOptIn: document.getElementById('publicProfile').checked, ...p }) });
      state.profile = data.player;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(data.player));
      refreshHub();
    } catch (error) { renderEnroll(error.message); }
  }

  async function refreshHub() {
    const body = document.getElementById('socialBody');
    body.innerHTML = '<p class="muted">Loading Player Hub…</p>';
    try {
      const p = progress();
      const updated = await api('profile', { method: 'POST', body: JSON.stringify({ displayName: state.profile.displayName, publicOptIn: state.profile.publicOptIn, ...p }) });
      state.profile = updated.player;
      localStorage.setItem(PROFILE_KEY, JSON.stringify(state.profile));
      const [nearby, friends, battles, history, rankings] = await Promise.all([api('nearby'), api('friends'), api('battles'), api('history'), api('rankings')]);
      state.battles = battles.battles;
      renderHub(nearby.players, friends.friends, history.history, rankings.players);
    } catch (error) { renderEnroll(error.message); }
  }

  function renderHub(players, friends, history, rankings) {
    const p = state.profile;
    const view = state.hub;
    const pending = friends.filter((item) => item.relation === 'incoming').length;
    const body = document.getElementById('socialBody');
    body.innerHTML = `
      <div class="player-summary">
        <div><span class="player-avatar">${esc(p.displayName.slice(0, 1).toUpperCase())}</span></div>
        <div><b>${esc(p.displayName)}</b><span>SmartScore ${p.score} · ${p.mastered} mastered</span></div>
        <button class="link-btn compact" id="editProfile">Edit</button>
      </div>
      <div class="social-tabs">
        <button class="${view === 'nearby' ? 'active' : ''}" data-tab="nearby">Nearby</button>
        <button class="${view === 'rankings' ? 'active' : ''}" data-tab="rankings">Top Players</button>
        <button class="${view === 'friends' ? 'active' : ''}" data-tab="friends">Friends${pending ? ` (${pending})` : ''}</button>
        <button class="${view === 'battles' ? 'active' : ''}" data-tab="battles">Battles</button>
        <button class="${view === 'history' ? 'active' : ''}" data-tab="history">History</button>
      </div>
      <div id="socialPanel"></div>`;
    body.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => { state.hub = button.dataset.tab; renderHub(players, friends, history, rankings); });
    document.getElementById('editProfile').onclick = () => renderEdit();
    const panel = document.getElementById('socialPanel');
    if (view === 'nearby') renderNearby(panel, players);
    if (view === 'rankings') renderRankings(panel, rankings);
    if (view === 'friends') renderFriends(panel, friends);
    if (view === 'battles') renderBattles(panel);
    if (view === 'history') renderHistory(panel, history);
  }

  function renderNearby(panel, players) {
    if (!state.profile.publicOptIn) {
      panel.innerHTML = '<p class="social-empty">Your profile is private. Turn on discovery in Edit to see nearby players and make friends.</p>';
      return;
    }
    panel.innerHTML = players.length ? players.map((player) => playerRow(player)).join('') : '<p class="social-empty">No nearby players yet. Invite a pool friend to join the Player Hub.</p>';
    panel.querySelectorAll('[data-friend]').forEach((button) => button.onclick = () => requestFriend(button.dataset.friend));
    panel.querySelectorAll('[data-battle]').forEach((button) => button.onclick = () => createBattle(button.dataset.battle));
  }

  function playerRow(player) {
    const relation = player.relation || 'none';
    const action = relation === 'friends'
      ? `<button class="link-btn compact" data-battle="${player.id}">⚡ Battle</button>`
      : relation === 'incoming'
        ? '<span class="social-state">Check Friends</span>'
        : relation === 'outgoing'
          ? '<span class="social-state">Request sent</span>'
          : `<button class="link-btn compact" data-friend="${player.id}">Add friend</button>`;
    return `<div class="player-row"><span class="player-avatar small">${esc(player.displayName.slice(0, 1).toUpperCase())}</span><div><b>${esc(player.displayName)}</b><span>SmartScore ${player.score} · ${player.mastered} mastered</span></div><span class="score-gap">${Math.abs(player.score - state.profile.score)} away</span>${action}</div>`;
  }

  function renderFriends(panel, friends) {
    panel.innerHTML = friends.length ? friends.map((item) => {
      const p = { ...item.player, relation: item.relation };
      const action = item.relation === 'incoming'
        ? `<button class="link-btn compact" data-respond="${item.requestId}" data-accept="true">Accept</button><button class="link-btn compact" data-respond="${item.requestId}" data-accept="false">Decline</button>`
        : playerRow(p).match(/<button[^>]*data-battle[^<]*<\/button>|<span class="social-state">[^<]*<\/span>/)?.[0] || '';
      return item.relation === 'incoming'
        ? `<div class="player-row"><span class="player-avatar small">${esc(p.displayName.slice(0, 1).toUpperCase())}</span><div><b>${esc(p.displayName)}</b><span>Wants to be friends</span></div>${action}</div>`
        : playerRow(p);
    }).join('') : '<p class="social-empty">No friends yet. Find players near your score and send a request.</p>';
    panel.querySelectorAll('[data-respond]').forEach((button) => button.onclick = () => respondFriend(button.dataset.respond, button.dataset.accept === 'true'));
    panel.querySelectorAll('[data-battle]').forEach((button) => button.onclick = () => createBattle(button.dataset.battle));
  }

  function renderBattles(panel) {
    const battles = state.battles.filter((battle) => !['declined', 'expired'].includes(battle.status));
    panel.innerHTML = `${battles.length ? battles.map((battle) => {
      let action = '';
      if (battle.status === 'pending') action = `<button class="link-btn compact" data-join="${battle.id}">Accept</button>`;
      if (battle.status === 'active' && battle.mine.score === null) action = `<button class="link-btn compact" data-play="${battle.id}">Play now</button>`;
      const score = battle.status === 'complete' ? `You ${battle.mine.score}/5 · ${battle.opponent.displayName} ${battle.theirs.score}/5` : battle.status === 'active' ? 'Battle in progress' : 'Awaiting response';
      return `<div class="battle-row"><div><b>vs. ${esc(battle.opponent.displayName)}</b><span>${score}</span></div>${action}</div>`;
    }).join('') : '<p class="social-empty">No active battle invites. Add a friend, then challenge them from the Friends tab.</p>'}<button class="history-trigger" id="battleHistory">View battle history</button>`;
    panel.querySelectorAll('[data-join]').forEach((button) => button.onclick = () => respondBattle(button.dataset.join, true));
    panel.querySelectorAll('[data-play]').forEach((button) => button.onclick = () => launchBattle(state.battles.find((battle) => battle.id === button.dataset.play)));
    document.getElementById('battleHistory').onclick = showBattleHistory;
  }

  function renderRankings(panel, rankings) {
    panel.innerHTML = rankings.length ? rankings.map((player) => `<div class="player-row ranking-row ${player.id === state.profile.id ? 'is-me' : ''}"><strong>#${player.rank}</strong><span class="player-avatar small">${esc(player.displayName.slice(0, 1).toUpperCase())}</span><div><b>${esc(player.displayName)}${player.id === state.profile.id ? ' (you)' : ''}</b><span>${player.mastered} mastered</span></div><strong>${player.score}</strong></div>`).join('') : '<p class="social-empty">Top Players will appear as members opt into public profiles.</p>';
  }

  function renderHistory(panel, history) {
    if (!history.length) {
      panel.innerHTML = '<p class="social-empty">Your first progress snapshot will appear here after this profile is saved.</p>';
      return;
    }
    const first = history[0];
    const latest = history[history.length - 1];
    const change = latest.score - first.score;
    panel.innerHTML = `<div class="history-summary"><b>${latest.score}</b><span>Latest SmartScore</span><strong class="${change >= 0 ? 'positive' : 'negative'}">${change >= 0 ? '+' : ''}${change} since first snapshot</strong></div><div class="history-list">${history.slice().reverse().map((entry) => `<div><span>${esc(entry.snapshotDate)}</span><b>${entry.score}</b><small>${entry.mastered} mastered</small></div>`).join('')}</div>`;
  }

  async function showBattleHistory() {
    try {
      const data = await api('battle-history');
      const wins = data.history.filter((item) => item.result === 'win').length;
      const losses = data.history.filter((item) => item.result === 'loss').length;
      const ties = data.history.filter((item) => item.result === 'tie').length;
      const panel = document.getElementById('socialPanel');
      panel.innerHTML = `<div class="history-summary"><b>${wins}–${losses}${ties ? `–${ties}` : ''}</b><span>Wins – losses${ties ? ' – ties' : ''}</span></div>${data.history.length ? `<div class="history-list">${data.history.map((item) => `<div><span>${esc(item.opponentName)}</span><b class="${item.result}">${item.result.toUpperCase()}</b><small>${item.playerScore}/5 · ${(item.playerElapsedMs / 1000).toFixed(1)}s</small></div>`).join('')}</div>` : '<p class="social-empty">No completed battles yet. Completed duels automatically move here.</p>'}<button class="history-trigger" id="backToBattles">Back to battles</button>`;
      document.getElementById('backToBattles').onclick = () => { state.hub = 'battles'; refreshHub(); };
    } catch (error) { alert(error.message); }
  }

  async function requestFriend(playerId) { try { await api('friends/request', { method: 'POST', body: JSON.stringify({ playerId }) }); refreshHub(); } catch (error) { alert(error.message); } }
  async function respondFriend(requestId, accept) { try { await api('friends/respond', { method: 'POST', body: JSON.stringify({ requestId, accept }) }); refreshHub(); } catch (error) { alert(error.message); } }
  async function createBattle(playerId) { try { await api('battles/create', { method: 'POST', body: JSON.stringify({ playerId }) }); state.hub = 'battles'; refreshHub(); } catch (error) { alert(error.message); } }
  async function respondBattle(battleId, accept) { try { const result = await api('battles/respond', { method: 'POST', body: JSON.stringify({ battleId, accept }) }); await refreshHub(); if (accept) launchBattle({ id: result.battle.id, seed: result.battle.seed, opponent: state.battles.find((battle) => battle.id === battleId)?.opponent || { displayName: 'friend' } }); } catch (error) { alert(error.message); } }

  function seeded(seed) {
    let value = [...seed].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) >>> 0;
    return () => { value += 0x6D2B79F5; let t = value; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function battleQuestions(seed) {
    const random = seeded(seed);
    const all = Object.entries(BQ.questions).flatMap(([skillId, list]) => list.map((question, index) => ({ skillId, index, question })));
    for (let index = all.length - 1; index > 0; index--) { const pick = Math.floor(random() * (index + 1)); [all[index], all[pick]] = [all[pick], all[index]]; }
    return all.slice(0, 5);
  }

  function launchBattle(battle) {
    state.activeBattle = { battle, questions: battleQuestions(battle.seed), index: 0, correct: 0, startedAt: performance.now() };
    closeModal('socialModal');
    openModal('battleModal');
    renderBattleQuestion();
  }

  function renderBattleQuestion() {
    const game = state.activeBattle;
    const entry = game.questions[game.index];
    const q = entry.question;
    const options = q.o.map((text, index) => ({ text, index })).sort(() => Math.random() - 0.5);
    document.getElementById('battleBody').innerHTML = `<div class="battle-score"><span>vs. ${esc(game.battle.opponent.displayName)}</span><b>${game.correct} correct · ${game.index + 1}/5</b></div><h4 class="battle-question">${esc(q.q)}</h4><div class="options battle-options">${options.map((option) => `<button class="option" data-answer="${option.index}">${esc(option.text)}</button>`).join('')}</div>`;
    document.querySelectorAll('[data-answer]').forEach((button) => button.onclick = () => answerBattle(Number(button.dataset.answer), q.a));
  }

  function answerBattle(answer, correct) {
    const buttons = [...document.querySelectorAll('[data-answer]')];
    buttons.forEach((button) => { button.disabled = true; if (Number(button.dataset.answer) === correct) button.classList.add('right'); });
    if (answer === correct) state.activeBattle.correct++;
    else buttons.find((button) => Number(button.dataset.answer) === answer)?.classList.add('wrong');
    setTimeout(() => {
      state.activeBattle.index++;
      if (state.activeBattle.index === 5) finishBattle(); else renderBattleQuestion();
    }, 600);
  }

  async function finishBattle() {
    const game = state.activeBattle;
    const elapsedMs = Math.round(performance.now() - game.startedAt);
    document.getElementById('battleBody').innerHTML = '<p class="muted">Saving your result…</p>';
    try {
      const result = await api('battles/submit', { method: 'POST', body: JSON.stringify({ battleId: game.battle.id, score: game.correct, elapsedMs }) });
      document.getElementById('battleBody').innerHTML = `<div class="battle-result"><span>⚡</span><h4>${game.correct}/5 in ${(elapsedMs / 1000).toFixed(1)} seconds</h4><p class="muted">${result.waiting ? 'Your score is saved. Waiting for your friend to finish.' : 'Both results are in. Check the Battles tab for the score.'}</p><button class="primary-btn" id="battleDone">Back to Player Hub</button></div>`;
      document.getElementById('battleDone').onclick = () => { closeModal('battleModal'); openHub(); };
    } catch (error) { document.getElementById('battleBody').innerHTML = `<p class="fb-status warn">${esc(error.message)}</p>`; }
  }

  window.Social = { init };
})();
