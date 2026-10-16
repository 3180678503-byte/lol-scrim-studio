CREATE TABLE IF NOT EXISTS moments (
 id TEXT PRIMARY KEY, uploader_key TEXT NOT NULL,
 title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 match_key TEXT, occurred_on TEXT, hero TEXT NOT NULL DEFAULT '',
 size INTEGER NOT NULL, duration REAL NOT NULL, mime TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','uploading','ready','deleted','expired')),
 upload_hash TEXT NOT NULL, owner_hash TEXT NOT NULL,
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
 poster_size INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS moments_status_time ON moments(status,created_at);
CREATE INDEX IF NOT EXISTS moments_uploader_time ON moments(uploader_key,created_at);
CREATE TABLE IF NOT EXISTS moment_players (
 moment_id TEXT NOT NULL, player_key TEXT NOT NULL,
 PRIMARY KEY(moment_id,player_key)
);
CREATE INDEX IF NOT EXISTS moment_player_lookup ON moment_players(player_key,moment_id);
CREATE TABLE IF NOT EXISTS moment_likes (
 moment_id TEXT NOT NULL, player_key TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(moment_id,player_key)
);
CREATE TABLE IF NOT EXISTS moment_comments (
 id TEXT PRIMARY KEY, moment_id TEXT NOT NULL, player_key TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 500), created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moment_comment_time ON moment_comments(moment_id,created_at);
CREATE INDEX IF NOT EXISTS moment_comment_author ON moment_comments(player_key,created_at);
CREATE TABLE IF NOT EXISTS moment_auth_attempts (fingerprint TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS moment_attempt_window ON moment_auth_attempts(fingerprint,created_at);
CREATE TABLE IF NOT EXISTS moment_archives (
 moment_id TEXT PRIMARY KEY,
 state TEXT NOT NULL CHECK(state IN ('queued','processing','submitting','submitted','ready','failed','manual')),
 consent_version TEXT NOT NULL, consent_at INTEGER NOT NULL,
 lease_hash TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, retry_after INTEGER NOT NULL DEFAULT 0,
 bvid TEXT, owner_mid INTEGER, ready_at INTEGER NOT NULL DEFAULT 0,
 verified_at INTEGER NOT NULL DEFAULT 0, source_deleted_at INTEGER NOT NULL DEFAULT 0,
 backup_sha256 TEXT NOT NULL DEFAULT '', error_code TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS moment_archive_queue ON moment_archives(state,retry_after,updated_at);
