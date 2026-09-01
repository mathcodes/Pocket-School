CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  received_at TEXT NOT NULL,
  topic TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  context TEXT NOT NULL DEFAULT '',
  meta TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS feedback_received_at_idx ON feedback (received_at DESC);

CREATE TABLE IF NOT EXISTS feedback_rate_limits (
  ip_hash TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS feedback_rate_limits_lookup_idx
  ON feedback_rate_limits (ip_hash, submitted_at);
