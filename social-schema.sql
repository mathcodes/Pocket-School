CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  public_opt_in INTEGER NOT NULL DEFAULT 1,
  overall_score INTEGER NOT NULL DEFAULT 0,
  mastered_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS players_nearby_idx
  ON players (public_opt_in, overall_score, updated_at DESC);

CREATE TABLE IF NOT EXISTS player_progress (
  player_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  overall_score INTEGER NOT NULL,
  mastered_count INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS player_progress_player_idx
  ON player_progress (player_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (sender_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_recipient_idx
  ON friend_requests (recipient_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  inviter_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'complete', 'declined', 'expired')),
  question_seed TEXT NOT NULL,
  inviter_score INTEGER,
  inviter_elapsed_ms INTEGER,
  opponent_score INTEGER,
  opponent_elapsed_ms INTEGER,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS battles_player_idx
  ON battles (inviter_id, opponent_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS battle_history (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('win', 'loss', 'tie')),
  player_score INTEGER NOT NULL,
  opponent_score INTEGER NOT NULL,
  player_elapsed_ms INTEGER NOT NULL,
  opponent_elapsed_ms INTEGER NOT NULL,
  completed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS battle_history_player_idx
  ON battle_history (player_id, completed_at DESC);
