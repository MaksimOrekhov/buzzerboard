import fixture from '../../../../docs/fixtures/bbs.synthetic.json'
import { describe, expect, it } from 'vitest'
import { NbaAdapterError } from '@/server/nba/adapters/errors'
import { normalizeBbsGameBox, normalizeBbsGames } from '@/server/nba/adapters/bbs'

const context = { fetchedAt: '2026-11-17T10:00:00.000Z', stale: false }
const archiveTeamIds = { home: '1610612738', away: '1610612752' }

function normalizeBox(
  teams: unknown,
  players: unknown,
  availability: unknown | null,
  game: ReturnType<typeof normalizeBbsGames>['data'][number],
  archiveGameId: string,
) {
  return normalizeBbsGameBox(teams, players, availability, game, archiveGameId, archiveTeamIds)
}

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

  it.each(['2027-01-12', '2027-04-20'])(
    'maps BBS start year 2026 to end year 2027 for %s',
    (date) => {
      const januaryGame = structuredClone(fixture)
      januaryGame.data[0]!.game_date = date
      const [year, month, day] = date.split('-').map(Number)
      januaryGame.data[0]!.kickoff_utc = new Date(
        Date.UTC(year!, month! - 1, day! + 1, 1),
      ).toISOString()
      expect(normalizeBbsGames(januaryGame, context).data[0]?.seasonEndYear).toBe(2027)
    },
  )

  it('normalizes team and player box rows under the same verified game snapshot', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teamStats = {
      data: {
        id: 90000001,
        game_date: '2026-11-15',
        home: {
          team_id: '1610612738',
          pts: '112',
          fgm: 41,
          fga: 88,
          fg_pct: 0.466,
          reb: 45,
          ast: 26,
        },
        away: { team_id: '1610612752', pts: 108, fgm: 40, fga: 90, fg_pct: 44.4, reb: 42, ast: 24 },
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
            team_id: '1610612738',
            pts: '112',
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
            team_id: '1610612752',
            pts: 108,
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
    const box = normalizeBox(teamStats, playerStats, availability, game, '90000001')
    expect(box.teams.map((team) => team.points)).toEqual([112, 108])
    expect(box.players.map((player) => player.player.id)).toEqual([
      'bbs:player:bos-player-1',
      'bbs:player:nyk-player-1',
    ])
    expect(box.players[0]).toMatchObject({ points: 112, minutes: '36:10', starter: true })
  })

  it('normalizes the live BBS team-native IDs and box envelope without embedded match IDs', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teamStats = {
      data: {
        game_id: game.providerId,
        match_id: game.providerId,
        game_date: game.nbaGameDate,
        home: { team_id: 1610612738, pts: 112 },
        away: { team_id: 1610612752, pts: 108 },
      },
    }
    const playerStats = {
      data: {
        home: [
          {
            player_id: 'bos-player-1',
            name: 'Synthetic Home Player',
            starter: true,
            minutes: '36:10',
            points: 112,
            rebounds: 8,
            offensive_rebounds: 2,
            defensive_rebounds: 6,
            assists: 5,
            steals: 1,
            blocks: 2,
            turnovers: 3,
            fouls: 2,
            plus_minus: 9,
            field_goals_made: 41,
            field_goals_attempted: 88,
            field_goal_pct: 0.466,
            three_pointers_made: 15,
            three_pointers_attempted: 40,
            three_point_pct: 0.375,
            free_throws_made: 15,
            free_throws_attempted: 18,
            free_throw_pct: 0.833,
          },
        ],
        away: [{ player_id: 'nyk-player-1', name: 'Synthetic Away Player', points: 108 }],
      },
    }
    const box = normalizeBox(teamStats, playerStats, null, game, '90000001')
    expect(box.teams.map(({ team, points }) => [team.abbreviation, points])).toEqual([
      ['BOS', 112],
      ['NYK', 108],
    ])
    expect(box.players[0]).toMatchObject({
      starter: true,
      didNotPlay: false,
      points: 112,
      rebounds: 8,
      offensiveRebounds: 2,
      defensiveRebounds: 6,
      assists: 5,
      steals: 1,
      blocks: 2,
      turnovers: 3,
      fouls: 2,
      plusMinus: 9,
      fieldGoals: { made: 41, attempted: 88, percentage: 0.466 },
      threePointers: { made: 15, attempted: 40, percentage: 0.375 },
      freeThrows: { made: 15, attempted: 18, percentage: 0.833 },
    })
  })

  it('validates either exact BBS match identifier format through the list crosswalk', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000001,
        home: { team_id: '1610612738', pts: 112 },
        away: { team_id: '1610612752', pts: 108 },
      },
    }
    const players = {
      data: {
        id: 90000001,
        match_uuid: game.providerId,
        home: [{ player_id: 'bos-player', player_name: 'Home', pts: 112 }],
        away: [{ player_id: 'nyk-player', player_name: 'Away', pts: 108 }],
      },
    }
    expect(normalizeBox(teams, players, null, game, '90000001').players).toHaveLength(2)
    expect(() =>
      normalizeBox(
        teams,
        { ...players, data: { ...players.data, match_uuid: 'another-game' } },
        null,
        game,
        '90000001',
      ),
    ).toThrow(NbaAdapterError)
  })

  it('rejects numeric archive IDs that do not match and score corrections from another snapshot', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000009,
        home: { team_id: '1610612738', pts: 112 },
        away: { team_id: '1610612752', pts: 108 },
      },
    }
    const players = { data: { id: game.providerId, home: [], away: [] } }
    const availability = { data: { id: 90000001, home: [], away: [] } }
    expect(() => normalizeBox(teams, players, availability, game, '90000001')).toThrow(
      NbaAdapterError,
    )
    expect(() =>
      normalizeBox(
        {
          data: {
            id: 90000001,
            home: { team_id: '1610612738', pts: 113 },
            away: { team_id: '1610612752', pts: 108 },
          },
        },
        players,
        availability,
        game,
        '90000001',
      ),
    ).toThrow(NbaAdapterError)
  })

  it('keeps missing or invalid availability optional and does not infer DNP from zero minutes', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000001,
        home: { team_id: '1610612738', pts: 112 },
        away: { team_id: '1610612752', pts: 108 },
      },
    }
    const players = {
      data: {
        id: game.providerId,
        home: [{ player_id: 'bos-player', player_name: 'Home', pts: 112 }],
        away: [{ player_id: 'nyk-player', player_name: 'Away', pts: 108 }],
      },
    }
    const availability = {
      data: {
        id: 90000001,
        home: [
          { player_id: 'bos-player', played: true },
          { player_id: 'bos-dnp', player_name: 'Confirmed DNP', played: false },
        ],
        away: [],
      },
    }
    const box = normalizeBox(teams, players, availability, game, '90000001')
    expect(box.players[1]).toMatchObject({ didNotPlay: true, minutes: null, points: null })

    const ambiguousPlayers = {
      data: {
        id: game.providerId,
        home: [{ player_id: 'bos-unknown', player_name: 'Unknown', minutes: '0', pts: 112 }],
        away: [{ player_id: 'nyk-player', player_name: 'Away', pts: 108 }],
      },
    }
    const unknown = normalizeBox(teams, ambiguousPlayers, null, game, '90000001')
    expect(unknown.players[0]).toMatchObject({ didNotPlay: null, minutes: '0' })

    const malformedAvailability = normalizeBox(
      teams,
      players,
      { error: { code: 'upstream_unavailable' } },
      game,
      '90000001',
    )
    expect(malformedAvailability.players[0]?.didNotPlay).toBeNull()
  })

  it.each([
    ['missing source ID', (payload: { data: Record<string, unknown> }) => delete payload.data.id],
    [
      'invalid reported date',
      (payload: { data: Record<string, unknown> }) => {
        payload.data.game_date = 'not-a-date'
      },
    ],
    [
      'wrong home team ID',
      (payload: { data: Record<string, unknown> }) => {
        ;(payload.data.home as Record<string, unknown>).team_id = 'wrong-team'
      },
    ],
  ])('rejects core box data with %s', (_label, mutate) => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    const teams = {
      data: {
        id: 90000001,
        game_date: '2026-11-15',
        home: { team_id: '1610612738', pts: 112 },
        away: { team_id: '1610612752', pts: 108 },
      },
    }
    const players = {
      data: {
        id: game.providerId,
        home: [{ player_id: 'home', pts: 112 }],
        away: [{ player_id: 'away', pts: 108 }],
      },
    }
    const invalid = structuredClone(teams)
    mutate(invalid)
    expect(() => normalizeBox(invalid, players, null, game, '90000001')).toThrow(NbaAdapterError)
  })

  it('rejects player point totals that do not reconcile to team totals', () => {
    const game = normalizeBbsGames(fixture, context).data[0]!
    expect(() =>
      normalizeBox(
        {
          data: {
            id: 90000001,
            home: { team_id: '1610612738', pts: 112 },
            away: { team_id: '1610612752', pts: 108 },
          },
        },
        {
          data: {
            id: game.providerId,
            home: [{ player_id: 'home', pts: 111 }],
            away: [{ player_id: 'away', pts: 108 }],
          },
        },
        null,
        game,
        '90000001',
      ),
    ).toThrow(NbaAdapterError)
  })
})
