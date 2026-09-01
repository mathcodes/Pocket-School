/* Progress persistence + the SmartScore engine. */
(function () {
  const KEY = 'pocketschool.progress.v1';

  const blankSkill = () => ({ score: 0, best: 0, answered: 0, correct: 0, mastered: false });

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) throw new Error('empty');
      const data = JSON.parse(raw);
      data.skills = data.skills || {};
      data.misses = data.misses || [];
      return data;
    } catch {
      return { skills: {}, misses: [], diamonds: 0, streak: 0, bestStreak: 0 };
    }
  }

  const state = load();

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable (private mode); progress stays in memory only */
    }
  }

  function skill(id) {
    if (!state.skills[id]) state.skills[id] = blankSkill();
    return state.skills[id];
  }

  // IXL-style scoring: gains shrink and penalties grow as the score approaches 100.
  function gainFor(score, streak) {
    const base = Math.max(3, Math.round((100 - score) * 0.22));
    return base + Math.min(4, Math.max(0, streak - 1));
  }

  function penaltyFor(score) {
    if (score < 40) return 5;
    if (score < 70) return 8;
    if (score < 90) return 12;
    return 15;
  }

  function masteryLabel(score) {
    if (score >= 100) return { text: 'Mastered', cls: 'm-master' };
    if (score >= 90) return { text: 'Excellent', cls: 'm-excellent' };
    if (score >= 70) return { text: 'Proficient', cls: 'm-proficient' };
    if (score >= 40) return { text: 'Practicing', cls: 'm-practicing' };
    if (score > 0) return { text: 'Started', cls: 'm-started' };
    return { text: 'Not started', cls: 'm-none' };
  }

  // Difficulty tier the learner should currently see, 1-3.
  function tierFor(score) {
    if (score < 40) return 1;
    if (score < 75) return 2;
    return 3;
  }

  function recordAnswer(skillId, questionIndex, correct) {
    const s = skill(skillId);
    s.answered++;
    if (correct) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      state.diamonds++;
      s.correct++;
      s.score = Math.min(100, s.score + gainFor(s.score, state.streak));
      const key = skillId + ':' + questionIndex;
      state.misses = state.misses.filter((m) => m !== key);
    } else {
      state.streak = 0;
      s.score = Math.max(0, s.score - penaltyFor(s.score));
      const key = skillId + ':' + questionIndex;
      if (!state.misses.includes(key)) state.misses.push(key);
    }
    s.best = Math.max(s.best, s.score);
    const justMastered = s.score >= 100 && !s.mastered;
    if (justMastered) {
      s.mastered = true;
      state.diamonds += 25;
    }
    save();
    return { skill: s, justMastered };
  }

  function resetAll() {
    state.skills = {};
    state.misses = [];
    state.diamonds = 0;
    state.streak = 0;
    state.bestStreak = 0;
    save();
  }

  window.Store = { state, skill, save, recordAnswer, masteryLabel, tierFor, resetAll };
})();
