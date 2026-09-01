/* Pool Shark — view routing, quiz engine, and rendering. */
(function () {
  const app = document.getElementById('app');
  const skillById = Object.fromEntries(BQ.skills.map((s) => [s.id, s]));
  let session = null;

  /* ---------- helpers ---------- */

  const tpl = (id) => document.getElementById(id).content.cloneNode(true);

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pool(skillId) {
    return BQ.questions[skillId] || [];
  }

  function overallProgress() {
    const total = BQ.skills.length * 100;
    const earned = BQ.skills.reduce((sum, s) => sum + Store.skill(s.id).score, 0);
    return { pct: Math.round((earned / total) * 100), earned, total };
  }

  function refreshStats() {
    document.getElementById('statDiamonds').textContent = Store.state.diamonds;
    document.getElementById('statStreak').textContent = Store.state.streak;
    document.getElementById('statMastered').textContent = BQ.skills.filter((s) => Store.skill(s.id).mastered).length;
  }

  /* ---------- dashboard ---------- */

  function renderDashboard() {
    session = null;
    app.replaceChildren(tpl('tpl-dashboard'));

    const { pct } = overallProgress();
    document.getElementById('overallFill').style.width = pct + '%';
    document.getElementById('overallLabel').textContent =
      `Curriculum progress ${pct}% · ${BQ.skills.length} skills · ${Object.values(BQ.questions).reduce((n, q) => n + q.length, 0)} questions`;

    const wrap = document.getElementById('levels');
    BQ.levels.forEach((lvl) => {
      const section = document.createElement('section');
      section.className = 'level';
      const skills = BQ.skills.filter((s) => s.level === lvl.id);
      const done = skills.filter((s) => Store.skill(s.id).mastered).length;

      const head = document.createElement('div');
      head.className = 'level-head';
      head.innerHTML = `<h3>${lvl.name}</h3><p class="muted">${lvl.blurb}</p>
        <span class="level-count">${done}/${skills.length} mastered</span>`;
      section.appendChild(head);

      const grid = document.createElement('div');
      grid.className = 'grid';
      skills.forEach((s) => grid.appendChild(skillCard(s)));
      section.appendChild(grid);
      wrap.appendChild(section);
    });

    document.getElementById('challengeBtn').onclick = startChallenge;
    document.getElementById('reviewBtn').onclick = startReview;
    refreshStats();
  }

  function skillCard(s) {
    const p = Store.skill(s.id);
    const m = Store.masteryLabel(p.score);
    const strand = BQ.strands[s.strand];

    const card = document.createElement('button');
    card.className = 'card' + (p.mastered ? ' is-mastered' : '');
    card.style.setProperty('--accent', strand.color);
    card.innerHTML = `
      <div class="card-top">
        <span class="card-icon">${s.icon}</span>
        ${ring(p.score)}
      </div>
      <h4>${s.name}</h4>
      <p class="card-desc">${s.desc}</p>
      <div class="card-foot">
        <span class="strand-tag">${strand.name}</span>
        <span class="mastery ${m.cls}">${m.text}</span>
      </div>`;
    card.onclick = () => startSkill(s.id);
    return card;
  }

  function ring(score) {
    const r = 20;
    const c = 2 * Math.PI * r;
    const off = c - (score / 100) * c;
    return `<svg class="ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="${r}" class="ring-bg"></circle>
      <circle cx="24" cy="24" r="${r}" class="ring-fg"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      <text x="24" y="28" text-anchor="middle">${score}</text>
    </svg>`;
  }

  /* ---------- session setup ---------- */

  function startSkill(skillId) {
    session = { mode: 'skill', skillId, asked: 0, correct: 0, recent: [], queue: null };
    renderPractice();
  }

  function startChallenge() {
    const unlocked = BQ.skills.filter((s) => Store.skill(s.id).score > 0);
    const source = unlocked.length >= 3 ? unlocked : BQ.skills.filter((s) => s.level <= 2);
    const picks = [];
    shuffle(source).forEach((s) => {
      const qs = pool(s.id);
      if (qs.length) picks.push({ skillId: s.id, idx: Math.floor(Math.random() * qs.length) });
    });
    session = { mode: 'challenge', queue: shuffle(picks).slice(0, 12), asked: 0, correct: 0, recent: [] };
    renderPractice();
  }

  function startReview() {
    const queue = Store.state.misses
      .map((k) => {
        const [skillId, idx] = k.split(':');
        return { skillId, idx: Number(idx) };
      })
      .filter((m) => pool(m.skillId)[m.idx]);
    if (!queue.length) {
      alert('No mistakes to review yet — go miss a few first. 🙂');
      return;
    }
    session = { mode: 'review', queue: shuffle(queue).slice(0, 15), asked: 0, correct: 0, recent: [] };
    renderPractice();
  }

  /* ---------- practice view ---------- */

  function renderPractice() {
    app.replaceChildren(tpl('tpl-practice'));
    window.scrollTo({ top: 0 });
    document.getElementById('backBtn').onclick = renderDashboard;

    const title = document.getElementById('pTitle');
    const sub = document.getElementById('pSub');
    if (session.mode === 'skill') {
      const s = skillById[session.skillId];
      title.textContent = `${s.icon} ${s.name}`;
      sub.textContent = `${BQ.levels[s.level - 1].name} · ${BQ.strands[s.strand].name}`;
    } else if (session.mode === 'challenge') {
      title.textContent = '⚡ Challenge Zone';
      sub.textContent = 'Mixed questions from the skills you have started.';
      document.getElementById('smartScore').classList.add('hidden');
    } else {
      title.textContent = '🔁 Review Mistakes';
      sub.textContent = 'Questions you have missed before. Get them right to clear them.';
      document.getElementById('smartScore').classList.add('hidden');
    }

    nextQuestion();
  }

  function pickQuestion() {
    if (session.queue) return session.queue[session.asked] || null;

    const qs = pool(session.skillId);
    const score = Store.skill(session.skillId).score;
    const tier = Store.tierFor(score);

    let candidates = qs.map((q, i) => ({ q, i })).filter((x) => x.q.d === tier);
    if (!candidates.length) candidates = qs.map((q, i) => ({ q, i }));

    let fresh = candidates.filter((x) => !session.recent.includes(x.i));
    if (!fresh.length) fresh = candidates;

    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    session.recent.push(pick.i);
    if (session.recent.length > 5) session.recent.shift();
    return { skillId: session.skillId, idx: pick.i };
  }

  function nextQuestion() {
    const ref = pickQuestion();
    if (!ref) return renderDone();

    const q = pool(ref.skillId)[ref.idx];
    const skill = skillById[ref.skillId];
    session.current = ref;

    document.getElementById('qTier').textContent =
      session.mode === 'skill' ? ['Intro', 'Core', 'Stretch'][q.d - 1] : skill.name;
    document.getElementById('qCount').textContent = session.queue
      ? `Question ${session.asked + 1} of ${session.queue.length}`
      : `${session.correct}/${session.asked} correct this session`;
    document.getElementById('qText').textContent = q.q;

    const opts = document.getElementById('options');
    opts.replaceChildren();
    shuffle(q.o.map((text, i) => ({ text, correct: i === q.a }))).forEach((o) => {
      const b = document.createElement('button');
      b.className = 'option';
      b.textContent = o.text;
      b.onclick = () => answer(b, o.correct, q, ref);
      opts.appendChild(b);
    });

    const fb = document.getElementById('feedback');
    fb.hidden = true;
    updateScoreDisplay();
  }

  function answer(btn, correct, q, ref) {
    const opts = [...document.querySelectorAll('.option')];
    opts.forEach((o) => (o.disabled = true));
    btn.classList.add(correct ? 'right' : 'wrong');
    if (!correct) {
      const rightText = q.o[q.a];
      opts.find((o) => o.textContent === rightText)?.classList.add('right');
    }

    session.asked++;
    if (correct) session.correct++;
    const res = Store.recordAnswer(ref.skillId, ref.idx, correct);
    refreshStats();
    updateScoreDisplay();

    const fb = document.getElementById('feedback');
    document.getElementById('fbHead').innerHTML = correct
      ? `<span class="ok">✔ Correct</span>${Store.state.streak > 2 ? ` <span class="streak">🔥 ${Store.state.streak} in a row</span>` : ''}`
      : '<span class="no">✘ Not quite</span>';
    document.getElementById('fbText').textContent = q.e;
    fb.hidden = false;

    const next = document.getElementById('nextBtn');
    const finished =
      (session.mode === 'skill' && res.justMastered) ||
      (session.queue && session.asked >= session.queue.length);
    next.textContent = finished ? 'See results →' : 'Continue →';
    next.onclick = finished ? renderDone : nextQuestion;
    next.focus();
  }

  function updateScoreDisplay() {
    if (session.mode !== 'skill') return;
    const score = Store.skill(session.skillId).score;
    document.getElementById('ssValue').textContent = score;
    document.getElementById('ssFill').style.width = score + '%';
    document.getElementById('smartScore').dataset.band = Store.masteryLabel(score).cls;
  }

  /* ---------- results ---------- */

  function renderDone() {
    const asked = session.asked;
    const correct = session.correct;
    const pct = asked ? Math.round((correct / asked) * 100) : 0;
    const mastered = session.mode === 'skill' && Store.skill(session.skillId).mastered;
    const mode = session.mode;
    const skillId = session.skillId;

    app.replaceChildren(tpl('tpl-done'));
    window.scrollTo({ top: 0 });
    document.getElementById('doneIcon').textContent = mastered ? '🏆' : pct >= 70 ? '🎉' : '📈';
    document.getElementById('doneTitle').textContent = mastered
      ? `Skill mastered: ${skillById[skillId].name}`
      : mode === 'challenge'
        ? 'Challenge complete'
        : mode === 'review'
          ? 'Review complete'
          : 'Session complete';
    document.getElementById('doneSub').textContent = mastered
      ? 'SmartScore 100. +25 diamonds awarded.'
      : `${correct} of ${asked} correct (${pct}%).`;

    const stats = document.getElementById('doneStats');
    const rows = [
      ['Questions answered', asked],
      ['Accuracy', pct + '%'],
      ['Best streak', Store.state.bestStreak],
      ['Diamonds', Store.state.diamonds]
    ];
    if (mode === 'skill') rows.unshift(['SmartScore', Store.skill(skillId).score]);
    stats.innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');

    document.getElementById('doneHome').onclick = renderDashboard;
    document.getElementById('doneAgain').onclick = () => {
      if (mode === 'skill') startSkill(skillId);
      else if (mode === 'challenge') startChallenge();
      else startReview();
    };
    refreshStats();
  }

  /* ---------- footer, modals, back to top ---------- */

  const GITHUB_URL = 'https://github.com/mathcodes/Pocket-School';
  const FEEDBACK_EMAIL = 'jonpchristie@gmail.com';

  const RESOURCES = [
    { name: 'WPA — World Standardized Rules of Play', url: 'https://wpapool.com/rules-of-play/', note: 'Official 8-ball, 9-ball, 10-ball, and general rules, fouls, and equipment specs.' },
    { name: 'Billiards & Pool Principles, Techniques, Resources (Dr. Dave Alciatore, Colorado State University)', url: 'https://billiards.colostate.edu/', note: 'Physics of aiming, tangent line and 30°/90° rules, throw, squirt, swerve, and gearing outside english.' },
    { name: '"Illustrated Principles" columns, Billiards Digest', url: 'https://billiards.colostate.edu/bd_articles/', note: 'Throw series, inside/outside english, and cue ball control analysis.' },
    { name: 'Wikipedia — Glossary of Cue Sports Terms', url: 'https://en.wikipedia.org/wiki/Glossary_of_cue_sports_terms', note: 'Terminology, table anatomy, bar-pool variants, and discipline-specific vocabulary.' },
    { name: 'Billiard Congress of America — Official Rules and Records Book', url: 'https://bca-pool.com/', note: 'North American rules reference and equipment standards.' },
    { name: 'WPBSA — Official Rules of Snooker and English Billiards', url: 'https://wpbsa.com/rules/', note: 'Cushion and pocket specifications, and snooker terminology contrasts.' },
    { name: 'WEPF — World Eightball Pool Federation Rules', url: 'https://www.wepf.org/', note: 'Blackball / UK eight-ball rules used for rule-variant questions.' },
    { name: 'Michael Ian Shamos — The New Illustrated Encyclopedia of Billiards', url: 'https://archive.org/details/newillustrateden0000sham', note: 'Historical background, definitions, and game descriptions.' },
    { name: 'Robert Byrne — Byrne\'s Standard Book of Pool and Billiards', url: 'https://openlibrary.org/search?q=byrne+standard+book+of+pool+and+billiards', note: 'Diamond systems, banks, kicks, and shot-making technique.' },
    { name: 'Philip B. Capelle — Play Your Best Pool', url: 'https://openlibrary.org/search?q=capelle+play+your+best+pool', note: 'Pattern play, position zones, shot selection, and safety strategy.' },
    { name: 'Wikipedia — Eight-ball, Nine-ball, One-pocket, Straight pool', url: 'https://en.wikipedia.org/wiki/Pool_(cue_sports)', note: 'Discipline-specific scoring, racking, and strategy overviews.' }
  ];

  function initChrome() {
    document.getElementById('year').textContent = new Date().getFullYear();
    document.getElementById('githubLink').href = GITHUB_URL;
    document.getElementById('footerBlurb').textContent =
      `${BQ.skills.length} skills · ${Object.values(BQ.questions).reduce((n, q) => n + q.length, 0)} questions · progress saved on this device`;

    document.getElementById('resList').innerHTML = RESOURCES.map(
      (r) => `<li><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.name}</a><span>${r.note}</span></li>`
    ).join('');

    document.getElementById('feedbackLink').onclick = openFeedback;
    document.getElementById('feedbackTop').onclick = openFeedback;
    document.getElementById('resourcesLink').onclick = () => openModal('resourcesModal');
    document.getElementById('fbSend').onclick = sendFeedback;
    document.getElementById('fbCopy').onclick = copyFeedback;
    document.getElementById('fbCopy2').onclick = copyFeedback;
    document.getElementById('fbDownload').onclick = downloadQueue;
    updateQueueUi();

    document.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => closeModal(el.closest('.modal')));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(closeModal);
    });

    initToTop();
  }

  let lastFocused = null;

  function openModal(id) {
    lastFocused = document.activeElement;
    const m = document.getElementById(id);
    m.hidden = false;
    document.body.classList.add('modal-open');
    m.querySelector('textarea, select, button')?.focus();
  }

  function closeModal(m) {
    if (!m || m.hidden) return;
    m.hidden = true;
    document.body.classList.remove('modal-open');
    lastFocused?.focus?.();
  }

  function openFeedback() {
    const where = session
      ? session.mode === 'skill'
        ? `Skill: ${skillById[session.skillId].name}`
        : `Mode: ${session.mode}`
      : 'Screen: skill dashboard';
    const q = document.getElementById('qText');
    document.getElementById('fbContext').textContent =
      `Sent with: ${where}${q && q.textContent ? ` · Question: “${q.textContent}”` : ''}`;
    document.getElementById('fbFallback').hidden = true;
    setFbStatus('');
    updateQueueUi();
    openModal('feedbackModal');
  }

  function feedbackPayload() {
    const topic = document.getElementById('fbTopic').value;
    const name = document.getElementById('fbName').value.trim();
    const message = document.getElementById('fbMessage').value.trim();
    const context = document.getElementById('fbContext').textContent;
    const meta = `Diamonds: ${Store.state.diamonds} · Mastered: ${BQ.skills.filter((s) => Store.skill(s.id).mastered).length} · ${navigator.platform || 'unknown'} ${window.screen.width}×${window.screen.height}`;
    // mailto URLs are truncated by many clients past ~2000 characters
    const trimmed = message.length > 1200 ? message.slice(0, 1200) + '… (truncated)' : message;
    const body = [trimmed || '(no message entered)', '', '---', context, `From: ${name || 'anonymous'}`, meta].join('\n');
    return { topic, name, message, context, meta, subject: `Pool Shark feedback — ${topic}`, body };
  }

  function setFbStatus(text, kind) {
    const el = document.getElementById('fbStatus');
    el.textContent = text;
    el.className = 'fb-status' + (kind ? ' ' + kind : '');
    el.hidden = !text;
  }

  async function sendFeedback() {
    const payload = feedbackPayload();
    if (!payload.message) {
      document.getElementById('fbMessage').focus();
      setFbStatus('Please enter a comment first.', 'warn');
      return;
    }

    const btn = document.getElementById('fbSend');
    btn.disabled = true;
    btn.textContent = 'Sending…';
    setFbStatus('');

    const sent = await postFeedback(payload);
    btn.disabled = false;
    btn.textContent = 'Send feedback';

    if (sent) {
      setFbStatus('Thanks — your feedback was received. ✓', 'ok');
      document.getElementById('fbMessage').value = '';
      document.getElementById('fbFallback').hidden = true;
      setTimeout(() => closeModal(document.getElementById('feedbackModal')), 1400);
      return;
    }

    queueFeedback(payload);
    prepareFallbackLinks(payload);
    setFbStatus('Saved on this device — no server is running. Use an option below to deliver it now.', 'warn');
    document.getElementById('fbFallback').hidden = false;
  }

  async function postFeedback(payload) {
    if (location.protocol === 'file:') return false;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          topic: payload.topic,
          name: payload.name,
          message: payload.message,
          context: payload.context,
          meta: payload.meta
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      return res.ok && data.ok === true;
    } catch {
      return false;
    }
  }

  /* Unsent feedback is kept locally so nothing is lost on static hosting. */
  const QUEUE_KEY = 'pocket-school-feedback.feedback.queue.v1';

  function readQueue() {
    try {
      const list = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }

  function queueFeedback(payload) {
    const list = readQueue();
    list.push({
      id: (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()),
      savedAt: new Date().toISOString(),
      topic: payload.topic,
      name: payload.name,
      message: payload.message,
      context: payload.context,
      meta: payload.meta
    });
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
    } catch {
      /* storage full or unavailable */
    }
    updateQueueUi();
  }

  function updateQueueUi() {
    const list = readQueue();
    const btn = document.getElementById('fbDownload');
    btn.hidden = list.length === 0;
    btn.textContent = `Download saved feedback (${list.length})`;
  }

  function downloadQueue() {
    const list = readQueue();
    if (!list.length) return;
    const blob = new Blob([JSON.stringify(list, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pocket-school-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function prepareFallbackLinks({ subject, body }) {
    const to = FEEDBACK_EMAIL;
    const su = encodeURIComponent(subject);
    const bd = encodeURIComponent(body);
    document.getElementById('fbGmail').href = `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${bd}`;
    document.getElementById('fbOutlook').href = `https://outlook.live.com/mail/0/deeplink/compose?to=${to}&subject=${su}&body=${bd}`;
    document.getElementById('fbMailto').href = `mailto:${to}?subject=${su}&body=${bd}`;
  }

  async function copyFeedback() {
    const { subject, body } = feedbackPayload();
    const text = `To: ${FEEDBACK_EMAIL}\nSubject: ${subject}\n\n${body}`;
    const btn = this instanceof HTMLElement ? this : document.getElementById('fbCopy');
    const label = btn.textContent;
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = legacyCopy(text);
    }
    btn.textContent = ok ? 'Copied ✓' : 'Copy failed';
    setTimeout(() => (btn.textContent = label), 2200);
  }

  // clipboard API is unavailable on file:// and other non-secure origins
  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }

  function initToTop() {
    const btn = document.getElementById('toTop');
    const update = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? window.scrollY / scrollable : 0;
      btn.hidden = pct <= 0.1;
    };
    btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    // browsers restore scroll position after load without firing a scroll event
    window.addEventListener('load', update);
    setTimeout(update, 300);
    update();
  }

  /* ---------- boot ---------- */

  document.getElementById('homeBtn').onclick = renderDashboard;
  document.getElementById('resetBtn').onclick = () => {
    if (confirm('Reset all SmartScores, diamonds, and mastery?')) {
      Store.resetAll();
      renderDashboard();
    }
  };

  initChrome();
  Social.init();
  renderDashboard();
})();
