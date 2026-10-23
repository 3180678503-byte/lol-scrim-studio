-- Additive migration: existing community reviews remain in their own tables.
CREATE TABLE IF NOT EXISTS prediction_events (
  id TEXT PRIMARY KEY, tournament TEXT NOT NULL, season TEXT NOT NULL,
  stage TEXT NOT NULL, start_at INTEGER NOT NULL, lock_at INTEGER NOT NULL,
  best_of INTEGER NOT NULL, state TEXT NOT NULL, signature TEXT NOT NULL,
  data TEXT NOT NULL, winner_id TEXT, loser_wins INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS predictions (
  event_id TEXT NOT NULL, member_key TEXT NOT NULL, owner_hash TEXT NOT NULL,
  signature TEXT NOT NULL, winner_id TEXT NOT NULL, loser_wins INTEGER NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  PRIMARY KEY(event_id, member_key)
);
CREATE INDEX IF NOT EXISTS predictions_member ON predictions(member_key);
CREATE TABLE IF NOT EXISTS prediction_sync (
  id INTEGER PRIMARY KEY CHECK(id = 1), attempted_at INTEGER NOT NULL,
  success_at INTEGER, error TEXT
);
