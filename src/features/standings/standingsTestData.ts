import type { ProviderRecordId, SeasonEndYear, StandingsRow, TeamId } from '@/entities/nba/model'

export function makeStandingsRows(
  conference: 'east' | 'west' = 'east',
  count = 15,
): StandingsRow[] {
  return Array.from({ length: count }, (_, index) => {
    const wins = 30 - index
    const losses = 10 + index
    const teamCode = `${conference}${String(index + 1).padStart(2, '0')}`

    return {
      team: {
        id: `test:team:${teamCode}` as TeamId,
        providerId: teamCode as ProviderRecordId,
        abbreviation: teamCode.toUpperCase(),
        displayName: `${conference === 'east' ? 'East' : 'West'} Team ${index + 1}`,
      },
      seasonEndYear: 2027 as SeasonEndYear,
      conference,
      record: {
        wins,
        losses,
        conferenceWins: null,
        conferenceLosses: null,
        homeWins: Math.floor(wins / 2),
        homeLosses: Math.floor(losses / 2),
        awayWins: wins - Math.floor(wins / 2),
        awayLosses: losses - Math.floor(losses / 2),
        lastTenWins: 6,
        pointsFor: 4200,
        pointsAgainst: 4100,
        averageMargin: 2.5,
      },
      winPercentage: wins / (wins + losses),
      officialRank: null,
      playoffSeed: null,
      providerOrder: index + 1,
    }
  })
}
