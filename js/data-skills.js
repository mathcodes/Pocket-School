/* Skill map for the Pool Shark billiards trainer.
   Structure mirrors an IXL-style curriculum: levels -> strands -> skills. */
window.BQ = window.BQ || { skills: [], questions: {} };

BQ.levels = [
  { id: 1, name: 'Level 1 — Fundamentals', blurb: 'Equipment, table anatomy, and the rules every player needs first.' },
  { id: 2, name: 'Level 2 — Core Technique', blurb: 'Aiming, stroke types, speed control, and rotation-game rules.' },
  { id: 3, name: 'Level 3 — Position Play', blurb: 'Tangent lines, english, patterns, banks, and kicks.' },
  { id: 4, name: 'Level 4 — Advanced Strategy', blurb: 'Safeties, cluster management, breaking, and ball-to-ball physics.' },
  { id: 5, name: 'Level 5 — Mastery', blurb: 'Specialty strokes, discipline-specific strategy, rules, and the mental game.' }
];

BQ.strands = {
  equipment: { name: 'Equipment & Table', color: '#7fd1ae' },
  rules: { name: 'Rules & Fouls', color: '#f2b134' },
  fundamentals: { name: 'Fundamentals', color: '#8ab6f9' },
  aiming: { name: 'Aiming & Shot-Making', color: '#f28b82' },
  cueball: { name: 'Cue Ball Control', color: '#c89bf5' },
  strategy: { name: 'Strategy & Patterns', color: '#6ee7dc' },
  physics: { name: 'Physics & Geometry', color: '#ffd166' },
  mental: { name: 'Mental Game', color: '#f7a1c4' }
};

BQ.skills = [
  // ---- Level 1 ----
  { id: 'table-anatomy', level: 1, strand: 'equipment', name: 'Table Anatomy & Equipment', icon: '🎱', desc: 'Rails, cushions, diamonds, cloth, spots, and pockets.' },
  { id: 'eightball-basics', level: 1, strand: 'rules', name: '8-Ball Basics', icon: '⚫', desc: 'Groups, the open table, and how a rack of 8-ball is won or lost.' },
  { id: 'fouls-scratches', level: 1, strand: 'rules', name: 'Fouls & Scratches', icon: '🚫', desc: 'What counts as a foul and what the incoming player gets.' },
  { id: 'stance-bridge', level: 1, strand: 'fundamentals', name: 'Stance, Grip & Bridge', icon: '🧍', desc: 'Building a repeatable platform for a straight stroke.' },
  { id: 'terminology', level: 1, strand: 'equipment', name: 'Core Terminology', icon: '📖', desc: 'The vocabulary used in every pool room on earth.' },

  // ---- Level 2 ----
  { id: 'aiming-basics', level: 2, strand: 'aiming', name: 'Aiming: Ghost Ball & Contact Point', icon: '🎯', desc: 'Cut angles, ghost-ball aiming, fractional hits.' },
  { id: 'stop-follow-draw', level: 2, strand: 'cueball', name: 'Stop, Follow & Draw', icon: '↕️', desc: 'The three core vertical-axis strokes and what each one does.' },
  { id: 'speed-control', level: 2, strand: 'cueball', name: 'Speed Control', icon: '📏', desc: 'Distance, rolling vs. sliding, and pocket speed.' },
  { id: 'diamond-system', level: 2, strand: 'physics', name: 'Rails, Diamonds & Geometry', icon: '💎', desc: 'Reading the table with diamonds and rebound angles.' },
  { id: 'ninball-rules', level: 2, strand: 'rules', name: '9-Ball & Rotation Rules', icon: '9️⃣', desc: 'Lowest ball first, push out, three-foul rule, break rules.' },

  // ---- Level 3 ----
  { id: 'tangent-line', level: 3, strand: 'physics', name: 'Tangent Line & the 30° Rule', icon: '📐', desc: 'Predicting where the cue ball goes after contact.' },
  { id: 'english-basics', level: 3, strand: 'cueball', name: 'English (Side Spin)', icon: '🌀', desc: 'Inside/outside, running/reverse, squirt and swerve.' },
  { id: 'position-play', level: 3, strand: 'strategy', name: 'Position Play & Shape', icon: '🗺️', desc: 'Playing shape zones, angles, and thinking two balls ahead.' },
  { id: 'bank-shots', level: 3, strand: 'aiming', name: 'Bank Shots', icon: '↩️', desc: 'Mirror systems, speed effects, and double-kiss avoidance.' },
  { id: 'kick-shots', level: 3, strand: 'aiming', name: 'Kick Shots & Escapes', icon: '🦵', desc: 'Getting out of trouble with one, two, and three rails.' },

  // ---- Level 4 ----
  { id: 'safety-play', level: 4, strand: 'strategy', name: 'Safety Play', icon: '🛡️', desc: 'Hooking your opponent, two-way shots, and when to duck.' },
  { id: 'eightball-patterns', level: 4, strand: 'strategy', name: '8-Ball Patterns & Clusters', icon: '🧩', desc: 'Key balls, insurance balls, breakouts, and blockers.' },
  { id: 'break-shot', level: 4, strand: 'fundamentals', name: 'The Break Shot', icon: '💥', desc: 'Rack quality, cue ball control, and legal break requirements.' },
  { id: 'throw-deflection', level: 4, strand: 'physics', name: 'Throw, Cling & Deflection', icon: '🔬', desc: 'Why balls do not go exactly where geometry says.' },
  { id: 'combos-caroms', level: 4, strand: 'aiming', name: 'Combos, Caroms & Kisses', icon: '🔗', desc: 'Multi-ball shots and how error multiplies.' },

  // ---- Level 3 (scenario work) ----
  { id: 'angle-math', level: 3, strand: 'physics', name: 'Cut Angles & Fractional Aiming', icon: '📏', desc: 'Fractional hits, cut-angle math, and how energy splits between the balls.' },
  { id: 'shot-selection', level: 3, strand: 'strategy', name: 'Shot Selection Scenarios', icon: '🤔', desc: 'Given a layout, pick the shot that actually keeps you at the table.' },

  // ---- Level 4 (scenario work) ----
  { id: 'diamond-systems-adv', level: 4, strand: 'physics', name: 'Diamond Systems in Depth', icon: '💠', desc: 'Corner-five, plus system, mirror counts, and system calibration.' },
  { id: 'table-scenarios', level: 4, strand: 'strategy', name: 'Reading the Layout', icon: '🧭', desc: 'Full-table scenarios: group choice, breakouts, blockers, and scratch avoidance.' },

  // ---- Level 5 ----
  { id: 'specialty-strokes', level: 5, strand: 'cueball', name: 'Jump, Massé & Specialty Strokes', icon: '🎪', desc: 'Legal jumps, curves, nip draw, and stun run-through.' },
  { id: 'endgame-scenarios', level: 5, strand: 'strategy', name: 'Endgame & Pressure Decisions', icon: '⏳', desc: 'Hill-hill choices, push outs, two-way shots, and intentional fouls.' },
  { id: 'onepocket-straight', level: 5, strand: 'strategy', name: 'One-Pocket & Straight Pool', icon: '♟️', desc: 'The two most strategic disciplines in American pool.' },
  { id: 'tournament-rules', level: 5, strand: 'rules', name: 'Tournament Rules & Etiquette', icon: '🏆', desc: 'Officiated play, shot clocks, jump-cue rules, sportsmanship.' },
  { id: 'mental-game', level: 5, strand: 'mental', name: 'Mental Game & Routine', icon: '🧠', desc: 'Pre-shot routine, pressure, practice design, and focus.' }
];
