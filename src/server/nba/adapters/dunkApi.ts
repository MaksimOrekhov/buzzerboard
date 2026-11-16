import type { NbaProviderAdapter, NormalizationContext } from '@/server/nba/adapters/adapter'
import {
  collectDunkStandings,
  collectGames,
  requireProviderRoot,
} from '@/server/nba/adapters/normalizers/shared'

/** Pure response adapter. Authentication and network calls belong in a server-only provider client. */
function normalizeGames(payload: unknown, context: NormalizationContext) {
  const root = requireProviderRoot(payload, 'dunkapi')
  return collectGames('dunkapi', root, context)
}

function normalizeStandings(payload: unknown, context: NormalizationContext) {
  const root = requireProviderRoot(payload, 'dunkapi')
  return collectDunkStandings('dunkapi', root, context)
}

export const dunkApiAdapter: NbaProviderAdapter = {
  provider: 'dunkapi',
  capabilities: {
    games: {
      normalize: normalizeGames,
    },
    standings: {
      normalize: normalizeStandings,
    },
  },
}
