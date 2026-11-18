-- Add a bounded per-team BBS snapshot capability without touching existing cache rows.
CREATE TABLE nba_cache_v4 (
  cache_key TEXT PRIMARY KEY,
  capability TEXT NOT NULL CHECK (capability IN ('games', 'standings', 'schedule', 'boxScore', 'teamSeason', 'teamDirectory')),
  provider TEXT NOT NULL CHECK (provider IN ('dunkapi', 'espn', 'bbs')),
  record_json TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  stale_until_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

INSERT INTO nba_cache_v4
  (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
SELECT cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms
FROM nba_cache;

DROP TABLE nba_cache;
ALTER TABLE nba_cache_v4 RENAME TO nba_cache;
CREATE INDEX nba_cache_expiry_idx ON nba_cache (stale_until_ms);
