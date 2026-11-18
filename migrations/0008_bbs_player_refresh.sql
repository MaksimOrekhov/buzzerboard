CREATE TABLE nba_player_refresh_state (
  season_end_year INTEGER PRIMARY KEY,
  progress_json TEXT NOT NULL CHECK(json_valid(progress_json)),
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE nba_player_refresh_observations (
  season_end_year INTEGER NOT NULL,
  player_id TEXT NOT NULL,
  stats_json TEXT NOT NULL CHECK(json_valid(stats_json)),
  observed_at TEXT NOT NULL,
  published_at_ms INTEGER,
  PRIMARY KEY (season_end_year, player_id)
);

CREATE TABLE nba_player_refresh_directory_pages (
  season_end_year INTEGER NOT NULL,
  page_offset INTEGER NOT NULL,
  total_rows INTEGER NOT NULL,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
  observed_at TEXT NOT NULL,
  PRIMARY KEY (season_end_year, page_offset)
);
