import type { NbaProviderAdapter } from '@/server/nba/adapters/adapter'
import {
  collectDunkStandings,
  collectGames,
  requireProviderRoot,
} from '@/server/nba/adapters/normalizers/shared'

/** Pure response adapter. Authentication and network calls belong in a server-only provider client. */
export const dunkApiAdapter: NbaProviderAdapter = {
  provider: 'dunkapi',
  normalizeGames(payload, context) {
    const root = requireProviderRoot(payload, 'dunkapi')
    return collectGames('dunkapi', root, context)
  },
  normalizeStandings(payload, context) {
    const root = requireProviderRoot(payload, 'dunkapi')
    return collectDunkStandings('dunkapi', root, context)
  },
}
