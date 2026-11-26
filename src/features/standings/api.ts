import type { SeasonEndYear } from '@/entities/nba/model'
import type { StandingsResponse } from '@/shared/api/nba/contracts'
import { isTeamRecord } from '@/shared/api/nba/gameDetailsGuards'
import { fetchWorkerResource, isSnapshotMeta } from '@/shared/api/nba/workerClient'
import { knownWinPercentage } from './standingsModel'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function isNullableCounter(value: unknown): value is number | null {
  return value === null || (Number.isSafeInteger(value) && Number(value) >= 0)
}

function isStandingsResponse(
  payload: unknown,
  seasonEndYear: SeasonEndYear,
): payload is StandingsResponse {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isSnapshotMeta(payload.meta))
    return false

  return payload.data.every((value) => {
    if (!isRecord(value) || !isTeamRecord(value.team) || !isRecord(value.record)) return false

    const { conference, record } = value
    return (
      // A season-scoped snapshot requires a known, matching season for every row.
      value.seasonEndYear === seasonEndYear &&
      (conference === null || conference === 'east' || conference === 'west') &&
      isNullableCounter(record.wins) &&
      isNullableCounter(record.losses) &&
      isNullableCounter(record.conferenceWins) &&
      isNullableCounter(record.conferenceLosses) &&
      isNullableCounter(record.homeWins) &&
      isNullableCounter(record.homeLosses) &&
      isNullableCounter(record.awayWins) &&
      isNullableCounter(record.awayLosses) &&
      isNullableCounter(record.lastTenWins) &&
      isNullableNumber(record.pointsFor) &&
      isNullableNumber(record.pointsAgainst) &&
      isNullableNumber(record.averageMargin) &&
      isNullableNumber(value.winPercentage) &&
      isNullableCounter(value.officialRank) &&
      isNullableCounter(value.playoffSeed) &&
      isNullableCounter(value.providerOrder)
    )
  })
}

export async function fetchStandings(
  seasonEndYear: SeasonEndYear,
  signal?: AbortSignal,
): Promise<StandingsResponse> {
  const snapshot = await fetchWorkerResource(
    `/api/standings?seasonEndYear=${encodeURIComponent(String(seasonEndYear))}`,
    (payload): payload is StandingsResponse => isStandingsResponse(payload, seasonEndYear),
    signal,
  )
  return {
    ...snapshot,
    data: snapshot.data.map((row) => {
      const winPercentage = knownWinPercentage(row.winPercentage)
      return winPercentage === row.winPercentage ? row : { ...row, winPercentage }
    }),
  }
}
