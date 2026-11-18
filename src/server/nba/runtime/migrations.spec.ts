// @vitest-environment node
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

function migration(file: string) {
  return readFileSync(new URL(`../../../../migrations/${file}`, import.meta.url), 'utf8')
}

describe('BBS D1 migration', () => {
  it('preserves existing provider snapshots and permits a separate BBS namespace', () => {
    const database = new DatabaseSync(':memory:')
    try {
      database.exec(migration('0001_nba_runtime.sql'))
      database.exec(migration('0002_game_details_cache.sql'))
      database
        .prepare(
          `
        INSERT INTO nba_cache
          (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
        VALUES (?, 'games', 'dunkapi', ?, 2000, 3000, 1000)
      `,
        )
        .run('dunkapi:nba:games:date=2026-11-15', '{"data":[]}')
      database
        .prepare(
          `
        INSERT INTO nba_credit_usage (month, baseline_credits, app_credits, box_score_credits)
        VALUES ('2026-11', 27, 2, 0)
      `,
        )
        .run()

      database.exec(migration('0003_bbs_provider.sql'))
      database.exec(migration('0004_provider_cooldowns.sql'))
      database.exec(migration('0005_team_season_cache.sql'))
      database.exec(migration('0006_bbs_players.sql'))
      expect(database.prepare('SELECT count(*) AS count FROM nba_player_snapshot').get()).toEqual({
        count: 0,
      })
      const prior = database
        .prepare('SELECT provider, record_json FROM nba_cache WHERE cache_key = ?')
        .get('dunkapi:nba:games:date=2026-11-15') as { provider: string; record_json: string }
      expect(prior).toEqual({ provider: 'dunkapi', record_json: '{"data":[]}' })
      expect(
        database.prepare('SELECT app_credits FROM nba_credit_usage WHERE month = ?').get('2026-11'),
      ).toEqual({ app_credits: 2 })
      expect(() =>
        database
          .prepare(
            `
        INSERT INTO nba_cache
          (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
        VALUES ('bbs:nba:games:date=2026-11-15', 'games', 'bbs', '{}', 2000, 3000, 1000)
      `,
          )
          .run(),
      ).not.toThrow()
      expect(() =>
        database
          .prepare(
            `
        INSERT INTO nba_cache
          (cache_key, capability, provider, record_json, expires_at_ms, stale_until_ms, updated_at_ms)
        VALUES ('bbs:nba:team-directory:season=2027', 'teamDirectory', 'bbs', '{}', 2000, 3000, 1000)
      `,
          )
          .run(),
      ).not.toThrow()
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name = 'nba_provider_cooldowns'",
          )
          .get(),
      ).toEqual({ name: 'nba_provider_cooldowns' })
    } finally {
      database.close()
    }
  })
})
