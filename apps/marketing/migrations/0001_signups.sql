CREATE TABLE signups (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  source TEXT NOT NULL CHECK (source IN ('download', 'cloud')),
  consent_version TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  requested_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  token_hash TEXT UNIQUE,
  token_expires_at INTEGER,
  email_sent_at INTEGER
);

CREATE INDEX signups_confirmed_at ON signups (confirmed_at);
