import type {
  Game,
  NbaProviderId,
  NbaSnapshot,
  NewsItem,
  Player,
  StandingsRow,
  UtcTimestamp,
} from '@/entities/nba/model'

export type NbaCapability =
  'games' | 'standings' | 'liveScores' | 'boxScores' | 'players' | 'playerHistory' | 'news'

export interface NormalizationContext {
  /** Server receive time, supplied by the caller in UTC. */
  fetchedAt: UtcTimestamp | string
  /** Cache-owned value; adapters must not infer it from response age. */
  stale: boolean
}

export interface CapabilityNormalizer<Data> {
  normalize(payload: unknown, context: NormalizationContext): NbaSnapshot<Data>
}

export interface NbaProviderCapabilities {
  games?: CapabilityNormalizer<readonly Game[]>
  standings?: CapabilityNormalizer<readonly StandingsRow[]>
  liveScores?: CapabilityNormalizer<readonly Game[]>
  boxScores?: CapabilityNormalizer<unknown>
  players?: CapabilityNormalizer<readonly Player[]>
  playerHistory?: CapabilityNormalizer<unknown>
  news?: CapabilityNormalizer<readonly NewsItem[]>
}

export interface NbaProviderAdapter {
  readonly provider: NbaProviderId
  readonly capabilities: NbaProviderCapabilities
}

export type ProviderOrderByCapability = Partial<Record<NbaCapability, readonly NbaProviderId[]>>

export interface ResolvedCapabilityAdapter {
  provider: NbaProviderId
  normalizer: NonNullable<NbaProviderCapabilities[NbaCapability]>
}

/** Resolve a provider independently for each capability; there is no global primary/fallback. */
export function resolveProviderForCapability(
  capability: NbaCapability,
  providerOrder: ProviderOrderByCapability,
  adapters: readonly NbaProviderAdapter[],
): ResolvedCapabilityAdapter | null {
  for (const provider of providerOrder[capability] ?? []) {
    const adapter = adapters.find((candidate) => candidate.provider === provider)
    const normalizer = adapter?.capabilities[capability]
    if (normalizer) return { provider, normalizer }
  }
  return null
}
