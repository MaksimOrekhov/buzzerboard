import { describe, expect, it } from 'vitest'
import type { SeasonEndYear } from '@/entities/nba/model'
import { NBA_TEAMS, findNbaTeam } from '@/entities/nba/teamCatalog'
import { NbaAdapterError } from './errors'
import {
  normalizeBbsStandings,
  normalizeBbsTeamDirectory,
  normalizeBbsTeamSeason,
} from './bbsTeams'

const seasonEndYear = 2027 as SeasonEndYear
const team = findNbaTeam('BOS')!

function teamSeason(overrides: Record<string, unknown> = {}) {
  return {
    team_meta: { id: 'synthetic-bbs-team-id', abbreviation: 'BOS', name: 'Boston Celtics' },
    season: '2026-27',
    record: '31-15',
    standings: { overall_rank: 3, conference_rank: null, games_back: 2, streak: 'W2' },
    home_away_splits: { home: { wins: 18, losses: 5 }, away: null },
    season_stats: {
      games_played: 45,
      ppg: 118.3,
      fg_pct: 47.1,
      three_pt_pct: 0.371,
      reb_pg: 44.2,
      ast_pg: 28.4,
      tov_pg: 12.1,
      player_efficiency_rating: 99.9,
    },
    last_10: Array.from({ length: 10 }, (_, index) => ({
      match_id: `synthetic-game-${index + 1}`,
      game_date: `2026-11-${String(index + 1).padStart(2, '0')}`,
      opponent: 'NYK',
      result: index < 7 ? 'W' : 'L',
      score_for: index < 7 ? 112 : 101,
      score_against: index < 7 ? 101 : 112,
      venue: index % 2 ? 'away' : 'home',
    })),
    top_players: [
      {
        player_id: 'synthetic-player-id',
        name: 'Synthetic Player',
        stat_label: 'Очки',
        stat_value: 24.6,
      },
    ],
    next_game: {
      match_id: 'synthetic-next-game',
      kickoff_utc: '2026-11-18T00:30:00Z',
      is_home: false,
      opponent: 'NYK',
    },
    ...overrides,
  }
}

describe('BBS team-season adapter', () => {
  it('normalizes source fields and keeps unavailable or inconsistent metrics null', () => {
    const snapshot = normalizeBbsTeamSeason(teamSeason(), team, seasonEndYear)
    expect(snapshot.providerTeamId).toBe('synthetic-bbs-team-id')
    expect(snapshot.data).toMatchObject({
      team: { id: 'nba:team:BOS', providerId: 'synthetic-bbs-team-id' },
      seasonEndYear: 2027,
      wins: 31,
      losses: 15,
      winPercentage: 31 / 46,
      overallRank: 3,
      conferenceRank: null,
      home: { wins: 18, losses: 5, ties: null },
      away: null,
      stats: {
        gamesPlayed: null,
        pointsPerGame: 118.3,
        threePointPercentage: 0.371,
        reboundsPerGame: 44.2,
        assistsPerGame: 28.4,
        turnoversPerGame: 12.1,
      },
      lastTen: expect.arrayContaining([
        expect.objectContaining({ gameId: 'bbs:game:synthetic-game-1' }),
      ]),
      leaders: [
        {
          playerId: 'bbs:player:synthetic-player-id',
          displayName: 'Synthetic Player',
          statLabel: 'Очки',
          statValue: 24.6,
        },
      ],
      nextGame: { gameId: 'bbs:game:synthetic-next-game', isHome: false, opponentCode: 'NYK' },
    })
    expect(snapshot.data.stats.fieldGoalPercentage).toBeCloseTo(0.471)
    expect(snapshot.data.stats).not.toHaveProperty('playerEfficiencyRating')
    expect(snapshot.data.lastTen).toHaveLength(10)
  })

  it('rejects a response with the wrong canonical team or season', () => {
    expect(() =>
      normalizeBbsTeamSeason(teamSeason({ season: '2025-26' }), team, seasonEndYear),
    ).toThrow(NbaAdapterError)
    expect(() =>
      normalizeBbsTeamSeason(
        teamSeason({ team_meta: { id: 'synthetic-id', abbreviation: 'NYK' } }),
        team,
        seasonEndYear,
      ),
    ).toThrow(NbaAdapterError)
  })

  it('keeps invalid split counts unavailable instead of normalizing fractional values', () => {
    const snapshot = normalizeBbsTeamSeason(
      teamSeason({
        home_away_splits: { home: { wins: 18.5, losses: 5 }, away: { wins: 13, losses: 10 } },
      }),
      team,
      seasonEndYear,
    )
    expect(snapshot.data.home).toBeNull()
    expect(snapshot.data.away).toMatchObject({ wins: 13, losses: 10 })
  })

  it('validates one-to-one standings and BBS directory crosswalks for all 30 teams', () => {
    const standings = {
      error: null,
      data: {
        season: '2026',
        standings: [
          {
            rows: NBA_TEAMS.map(({ code, name }) => ({
              team_id: `synthetic-${code}`,
              abbreviation: code,
              team_name: name,
            })),
          },
        ],
      },
    }
    const directory = {
      data: NBA_TEAMS.map(({ code, name }) => ({
        id: `synthetic-${code}`,
        short_name: code,
        name,
      })),
      error: null,
    }
    const references = normalizeBbsTeamDirectory(standings, directory, seasonEndYear)
    expect(references).toHaveLength(30)
    expect(new Set(references.map(({ teamId }) => teamId)).size).toBe(30)
    expect(references.find(({ teamId }) => teamId === 'nba:team:UTA')).toMatchObject({
      providerTeamId: 'synthetic-UTA',
    })
    expect(() =>
      normalizeBbsTeamDirectory(standings, { data: directory.data.slice(1) }, seasonEndYear),
    ).toThrow(NbaAdapterError)
  })

  it('normalizes all 30 BBS standings rows without inventing unavailable record fields', () => {
    const payload = {
      error: null,
      data: {
        season: '2026',
        standings: [
          {
            conference: 'East',
            rows: NBA_TEAMS.filter((team) => team.conference === 'east').map((team, index) => ({
              team_id: `east-${team.code}`,
              abbreviation: team.code,
              wins: 10,
              losses: 10,
              win_percentage: 0.99,
              conference_rank: index + 1,
            })),
          },
          {
            conference: 'West',
            rows: NBA_TEAMS.filter((team) => team.conference === 'west').map((team, index) => ({
              team_id: `west-${team.code}`,
              abbreviation: team.code,
              wins: 10,
              losses: 10,
              win_percentage: 0.99,
              conference_rank: index + 1,
            })),
          },
        ],
      },
    }

    const rows = normalizeBbsStandings(payload, seasonEndYear)

    expect(rows).toHaveLength(30)
    expect(new Set(rows.map((row) => row.team.id)).size).toBe(30)
    expect(rows.find((row) => row.team.abbreviation === 'BOS')).toMatchObject({
      conference: 'east',
      record: { wins: 10, losses: 10, pointsFor: null },
      winPercentage: 0.5,
      officialRank: expect.any(Number),
    })
  })
})
