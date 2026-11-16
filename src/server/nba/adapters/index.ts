import type { NbaProviderAdapter } from '@/server/nba/adapters/adapter'
import { dunkApiAdapter } from '@/server/nba/adapters/dunkApi'
import { espnAdapter } from '@/server/nba/adapters/espn'

/** Pure normalizers only; no network client, credentials, or default provider selection. */
export const nbaProviderAdapters = {
  dunkapi: dunkApiAdapter,
  espn: espnAdapter,
} satisfies Record<string, NbaProviderAdapter>

export type NbaAdapterKey = keyof typeof nbaProviderAdapters
