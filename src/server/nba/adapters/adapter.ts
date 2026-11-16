import type {
  Game,
  NbaProviderId,
  NbaSnapshot,
  StandingsRow,
  UtcTimestamp,
} from '@/entities/nba/model'

export interface NormalizationContext {
  /** Server receive time, supplied by the caller in UTC. */
  fetchedAt: UtcTimestamp | string
  /** Cache-owned value; adapters must not infer it from response age. */
  stale: boolean
}

export interface NbaProviderAdapter {
  readonly provider: NbaProviderId
  normalizeGames(payload: unknown, context: NormalizationContext): NbaSnapshot<readonly Game[]>
  normalizeStandings(
    payload: unknown,
    context: NormalizationContext,
  ): NbaSnapshot<readonly StandingsRow[]>
}
