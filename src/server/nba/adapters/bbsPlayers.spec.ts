import { describe, expect, it } from 'vitest'
import type { NbaPlayerEntry } from '@/entities/nba/players'
import { normalizeBbsPlayerAverage, normalizeBbsPlayerDirectoryPage } from './bbsPlayers'

const id = '1a2b3c4d-1111-4222-8333-123456789abc'
const player: NbaPlayerEntry = {
  id: `bbs:player:${id}`,
  name: 'Test Player',
  team: 'BOS',
  position: null,
  number: null,
  height: null,
  weight: null,
  stats: null,
}

function averages(overrides: Record<string, unknown> = {}) {
  return {
    data: [
      {
        player_id: id,
        season: 2026,
        games_played: 0,
        min: null,
        pts: null,
        reb: null,
        ast: null,
        fgm: null,
        fga: null,
        fg_pct: null,
        fg3m: null,
        fg3a: null,
        fg3_pct: null,
        ftm: null,
        fta: null,
        ft_pct: null,
        stl: null,
        blk: null,
        oreb: null,
        dreb: null,
        turnover: null,
        pf: null,
        ...overrides,
      },
    ],
  }
}

describe('BBS player normalizers', () => {
  it('accepts a verified zero-game season row without inventing averages', () => {
    const result = normalizeBbsPlayerAverage(averages(), player, 2026)

    expect(result).not.toBeNull()
    expect(result?.gp).toBe(0)
    expect(result?.min).toBeNull()
    expect(result?.pts).toBeNull()
    expect(result?.fg).toBeNull()
  })

  it('rejects average rows for a different player or season and duplicate rows', () => {
    expect(() =>
      normalizeBbsPlayerAverage(
        averages({ player_id: '9a2b3c4d-1111-4222-8333-123456789abc' }),
        player,
        2026,
      ),
    ).toThrow(/identity/)
    expect(() => normalizeBbsPlayerAverage(averages({ season: 2025 }), player, 2026)).toThrow(
      /identity/,
    )
    expect(() =>
      normalizeBbsPlayerAverage({ data: [...averages().data, ...averages().data] }, player, 2026),
    ).toThrow(/rows/)
  })

  it('requires complete, season-scoped directory pagination', () => {
    const payload = {
      data: [{ id, name: 'Test Player' }],
      pagination: { total: 1, offset: 0 },
      meta: { filters_applied: { season: 2026, league_scope: { mode: 'requested_season' } } },
    }
    expect(normalizeBbsPlayerDirectoryPage(payload, 2026, 0).rows).toHaveLength(1)
    expect(() => normalizeBbsPlayerDirectoryPage(payload, 2025, 0)).toThrow(/pagination/)
    expect(() =>
      normalizeBbsPlayerDirectoryPage({ ...payload, pagination: { total: 2, offset: 0 } }, 2026, 0),
    ).toThrow(/pagination/)
  })
})
