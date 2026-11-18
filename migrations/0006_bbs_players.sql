CREATE TABLE nba_player_snapshot (
  season_end_year INTEGER PRIMARY KEY,
  fetched_at TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
