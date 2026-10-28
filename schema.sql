CREATE TABLE IF NOT EXISTS reports (
  hash        TEXT PRIMARY KEY,
  pkg_key     TEXT NOT NULL,
  name        TEXT,
  kind        TEXT,
  source_url  TEXT,
  source_type TEXT,
  version     TEXT,
  grade       TEXT NOT NULL,
  score       INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  scan_count  INTEGER NOT NULL DEFAULT 1,
  view_count  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_reports_pkg ON reports(pkg_key);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts          INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  hash        TEXT,
  scanner_key TEXT,
  ref         TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS interest (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      INTEGER NOT NULL,
  contact TEXT NOT NULL,
  hash    TEXT
);

CREATE TABLE IF NOT EXISTS known_packages (
  pkg_key     TEXT PRIMARY KEY,
  in_honeypot INTEGER NOT NULL DEFAULT 0,
  in_census   INTEGER NOT NULL DEFAULT 0,
  installs    INTEGER,
  label       TEXT
);
