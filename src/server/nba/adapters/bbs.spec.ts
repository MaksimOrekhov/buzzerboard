import fixture from '../../../../docs/fixtures/bbs.synthetic.json'
import { describe, expect, it } from 'vitest'
import { NbaAdapterError } from '@/server/nba/adapters/errors'
import { normalizeBbsGameBox, normalizeBbsGames } from '@/server/nba/adapters/bbs'

const context = { fetchedAt: '2026-11-17T10:00:00.000Z', stale: false }

describe('Big Balls Sports Data fixtures', () => {
  it('normalizes source-scoped UUIDs, ET game dates, season start years and numeric strings', () => {
    const snapshot = normalizeBbsGames(fixture, context)
    expect(snapshot.data).toHaveLength(2)
    expect(snapshot.data[0]).toMatchObject({
      id: 'bbs:game:synthetic-final-match-uuid',
      providerId: 'synthetic-final-match-uuid',
      nbaGameDate: '2026-11-15',
      seasonEndYear: 2027,
      status: 'final',
      score: { home: 112, away: 108 },
    })
    expect(snapshot.data[0]?.scoreByPeriod).toEqual([
      { period: 1, home: 28, away: 26 },
      { period: 2, home: 31, away: 29 },
      { period: 3, home: 27, away: 24 },
      { period: 4, home: 26, away: 29 },
    ])
    expect(snapshot.data[1]?.status).toBe('scheduled')
    expect(snapshot.data[1]?.seasonEndYear).toBe(2027)
    expect(snapshot.data[1]?.score).toEqual({ home: null, away: null })
    expect(snapshot.data[0]?.id).not.toBe(`dunkapi:game:${snapshot.data[0]?.providerId}`)
    expect(snapshot.meta.rejectedRecords).toBe(0)
  })

  it('normalizes team and player box rows under the same verified game snapshot', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teamStats = {
      data: {
        id: 90000001,
        game_date: '2026-11-15',
        home: { team_id: 'bbs-bos', pts: '112', fgm: 41, fga: 88, fg_pct: 0.466, reb: 45, ast: 26 },
        away: { team_id: 'bbs-nyk', pts: 108, fgm: 40, fga: 90, fg_pct: 44.4, reb: 42, ast: 24 },
      },
    }
    const playerStats = {
      data: {
        id: game.providerId,
        home: [
          {
            player_id: 'bos-player-1',
            player_name: 'Synthetic Home Player',
            starter: true,
            minutes: '36:10',
            pts: '28',
            reb: 7,
            ast: 5,
          },
        ],
        away: [
          {
            player_id: 'nyk-player-1',
            player_name: 'Synthetic Away Player',
            starter: false,
            minutes: 31,
            pts: 22,
            reb: 4,
            ast: 8,
          },
        ],
      },
    }
    const availability = {
      data: {
        id: 90000001,
        home: [{ player_id: 'bos-player-1', played: true, starter: true }],
        away: [{ player_id: 'nyk-player-1', played: true, starter: false }],
      },
    }
    const box = normalizeBbsGameBox(teamStats, playerStats, availability, game, '90000001')
    expect(box.teams.map((team) => team.points)).toEqual([112, 108])
    expect(box.players.map((player) => player.player.id)).toEqual([
      'bbs:player:bos-player-1',
      'bbs:player:nyk-player-1',
    ])
    expect(box.players[0]).toMatchObject({ points: 28, minutes: '36:10', starter: true })
  })

  it('rejects numeric archive IDs that do not match and score corrections from another snapshot', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000009,
        home: { team_id: 'bbs-bos', pts: 112 },
        away: { team_id: 'bbs-nyk', pts: 108 },
      },
    }
    const players = { data: { id: game.providerId, home: [], away: [] } }
    const availability = { data: { id: 90000001, home: [], away: [] } }
    expect(() => normalizeBbsGameBox(teams, players, availability, game, '90000001')).toThrow(
      NbaAdapterError,
    )
    expect(() =>
      normalizeBbsGameBox(
        {
          data: {
            id: 90000001,
            home: { team_id: 'bbs-bos', pts: 113 },
            away: { team_id: 'bbs-nyk', pts: 108 },
          },
        },
        players,
        availability,
        game,
        '90000001',
      ),
    ).toThrow(NbaAdapterError)
  })

  it('includes only explicitly confirmed DNP rows and rejects ambiguous zero-minute rows', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000001,
        home: { team_id: 'bbs-bos', pts: 112 },
        away: { team_id: 'bbs-nyk', pts: 108 },
      },
    }
    const players = { data: { id: game.providerId, home: [], away: [] } }
    const availability = {
      data: {
        id: 90000001,
        home: [{ player_id: 'bos-dnp', player_name: 'Confirmed DNP', played: false }],
        away: [],
      },
    }
    const box = normalizeBbsGameBox(teams, players, availability, game, '90000001')
    expect(box.players[0]).toMatchObject({ didNotPlay: true, minutes: null, points: null })

    const ambiguousPlayers = {
      data: {
        id: game.providerId,
        home: [{ player_id: 'bos-unknown', player_name: 'Unknown', minutes: '0' }],
        away: [],
      },
    }
    expect(() =>
      normalizeBbsGameBox(
        teams,
        ambiguousPlayers,
        { data: { id: 90000001, home: [], away: [] } },
        game,
        '90000001',
      ),
    ).toThrow(NbaAdapterError)
  })
})
