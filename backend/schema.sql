CREATE TABLE IF NOT EXISTS votes (
 target_id TEXT NOT NULL,
 rater_key TEXT NOT NULL,
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),
 updated_at INTEGER NOT NULL,
 PRIMARY KEY (target_id,rater_key)
);
CREATE TABLE IF NOT EXISTS comments (
 id TEXT PRIMARY KEY,
 target_id TEXT NOT NULL,
 rater_key TEXT NOT NULL,
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 1000),
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS comment_target_time ON comments(target_id,created_at);
CREATE TABLE IF NOT EXISTS submissions (
 request_id TEXT PRIMARY KEY,
 rater_key TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submission_rater_time ON submissions(rater_key,created_at);
