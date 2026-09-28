CREATE TABLE IF NOT EXISTS storage_reservations (
  object_key TEXT PRIMARY KEY,
  bytes INTEGER NOT NULL CHECK(bytes >= 0)
);
CREATE TABLE IF NOT EXISTS desktop_auth_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge TEXT NOT NULL,
  label TEXT,
  expires_at INTEGER NOT NULL
);
