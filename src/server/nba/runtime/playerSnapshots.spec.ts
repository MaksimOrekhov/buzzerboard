import { describe, expect, it, vi } from 'vitest'
import { createNbaWorker } from '@/server/worker'
import type { D1Database } from './types'

const id = 'bbs:player:00000000-0000-0000-0000-000000000001'
const player = {
  id,
  name: 'Synthetic Player',
  team: null,
  position: null,
  number: null,
  height: null,
  weight: null,
  stats: null,
}
const coverage = { providerRows: 1, total: 1, checked: 0, averages: 0, enriched: 0, boxLinks: 0 }
function fixture(
  payload: unknown = {
    version: 2,
    players: [player],
    details: {},
    gameRefs: {},
    directoryAt: '2026-11-16T12:00:00Z',
    averageAt: {},
    coverage,
  },
  exists = true,
) {
  const bind = vi.fn().mockReturnValue({
    first: vi.fn().mockResolvedValue(
      exists
        ? {
            fetched_at: '2026-11-16T12:00:00Z',
            payload: JSON.stringify(payload),
          }
        : null,
    ),
  })
  const db = { prepare: vi.fn().mockReturnValue({ bind }) } as unknown as D1Database
  const fetcher = vi.fn<typeof fetch>()
  const worker = createNbaWorker({ fetcher, now: () => Date.parse('2026-11-18T12:00:00Z') })
  return { worker, db, bind, fetcher }
}

describe('cache-only player endpoints', () => {
  it('distinguishes a missing snapshot from an existing malformed snapshot', async () => {
    for (const [exists, code] of [
      [false, 'cache_miss'],
      [true, 'invalid_response'],
    ] as const) {
      const { worker, db } = fixture({ broken: true }, exists)
      const response = await worker.fetch(
        new Request('https://test.invalid/api/players/' + encodeURIComponent(id)),
        { NBA_DB: db, BBS_PLAYERS_ENABLED: 'true' },
      )
      expect(response.status).toBe(503)
      expect(await response.json()).toMatchObject({ error: { code } })
    }
  })
  it('keeps players disabled by default and refuses mutations and unsupported seasons', async () => {
    const { worker, db, fetcher } = fixture()
    const req = (suffix = '', method = 'GET') =>
      new Request('https://test.invalid/api/players' + suffix, { method })
    expect((await worker.fetch(req(), { NBA_DB: db })).status).toBe(503)
    const enabled = { NBA_DB: db, BBS_PLAYERS_ENABLED: 'true' }
    expect((await worker.fetch(req('', 'POST'), enabled)).status).toBe(405)
    expect((await worker.fetch(req('?seasonEndYear=2026'), enabled)).status).toBe(400)
    expect((await worker.fetch(req('/dunkapi%3Aplayer%3A123'), enabled)).status).toBe(400)
    expect(db.prepare).not.toHaveBeenCalled()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('serves a partial catalogue and stable profile in one D1 read each', async () => {
    const { worker, db, bind, fetcher } = fixture()
    const env = { NBA_DB: db, BBS_PLAYERS_ENABLED: 'true' }
    const read = (suffix = '') =>
      worker.fetch(new Request('https://test.invalid/api/players' + suffix), env)
    const directory = await read()
    expect(await directory.json()).toMatchObject({
      source: 'bbs',
      players: [player],
      coverage,
      isStale: true,
    })
    expect(directory.headers.get('warning')).toContain('stale')
    const profile = await read('/' + encodeURIComponent(id))
    expect(await profile.json()).toMatchObject({ player, detail: null })
    expect(bind.mock.calls).toEqual([[2027], [2027]])
    expect((await read('/' + encodeURIComponent(id.replace(/1$/, '2')))).status).toBe(404)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
