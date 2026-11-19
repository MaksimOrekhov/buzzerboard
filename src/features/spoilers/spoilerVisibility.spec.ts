import { describe, expect, it } from 'vitest'
import type { Game } from '@/entities/nba/model'
import {
  completedRowIsProtected,
  gameIsProtected,
  predatesProtectedGames,
  spoilerWindow,
} from './spoilerVisibility'
import { createSpoilerMode, SPOILER_STORAGE_KEY } from './useSpoilerMode'

function game(date: string, status: Game['status'] = 'final', id = 'bbs:game:1') {
  return {
    id,
    nbaGameDate: date,
    status,
    startsAt: null,
    score: { home: null, away: null },
    scoreByPeriod: null,
  } as Game
}
const time = (timestamp: string) => Date.parse(timestamp)

describe('spoiler window', () => {
  it('uses yesterday in New York even after Cyprus and UTC midnight', () => {
    const late = spoilerWindow(time('2026-11-19T02:30:00Z'))
    expect(late).toMatchObject({ today: '2026-11-18', yesterday: '2026-11-17' })
    const morning = spoilerWindow(time('2026-11-19T06:30:00Z'))
    expect(morning).toMatchObject({ today: '2026-11-19', yesterday: '2026-11-18' })
    expect(gameIsProtected(game('2026-11-18'), morning)).toBe(true)
    // An empty yesterday does not move the window back to the last game day.
    expect(gameIsProtected(game('2026-11-17'), morning)).toBe(false)
  })

  it.each([
    ['2026-03-08T04:59:59Z', '2026-03-07'],
    ['2026-03-08T05:00:00Z', '2026-03-08'],
    ['2026-03-09T04:00:00Z', '2026-03-09'],
    ['2026-11-01T03:59:59Z', '2026-10-31'],
    ['2026-11-01T04:00:00Z', '2026-11-01'],
    ['2026-11-02T05:00:00Z', '2026-11-02'],
  ])('finds the ET calendar boundary at %s', (instant, date) => {
    expect(spoilerWindow(time(instant)).today).toBe(date)
  })

  it('keeps upcoming games as schedule and protects games already played', () => {
    const window = spoilerWindow(time('2026-11-19T16:00:00Z'))
    for (const status of ['live', 'final', 'suspended'] as const)
      expect(gameIsProtected(game(window.today, status), window)).toBe(true)
    for (const status of ['scheduled', 'postponed', 'canceled'] as const)
      expect(gameIsProtected(game(window.today, status), window)).toBe(false)
    expect(
      gameIsProtected(
        {
          ...game(window.today, 'scheduled'),
          startsAt: '2026-11-19T15:59:00Z' as Game['startsAt'],
        },
        window,
      ),
    ).toBe(true)
    expect(
      gameIsProtected(
        {
          ...game(window.today, 'scheduled'),
          startsAt: '2026-11-19T16:01:00Z' as Game['startsAt'],
        },
        window,
      ),
    ).toBe(false)
    expect(gameIsProtected(game('2026-11-20', 'scheduled'), window)).toBe(false)
    expect(gameIsProtected(game(window.yesterday, 'postponed'), window)).toBe(true)
  })

  it('requires explicit, valid coverage before the first protected game date', () => {
    const window = spoilerWindow(time('2026-11-19T16:00:00Z'))
    expect(predatesProtectedGames('2026-11-18T04:59:59Z', window)).toBe(true)
    expect(predatesProtectedGames('2026-11-18T05:00:00Z', window)).toBe(false)
    expect(predatesProtectedGames('2026-11-17', window)).toBe(false)
    expect(predatesProtectedGames('invalidZ', window)).toBe(false)
    expect(predatesProtectedGames(undefined, window)).toBe(false)
    expect(completedRowIsProtected('2026-11-17', window)).toBe(false)
  })
})

describe('spoiler preference', () => {
  it('restores reveals by canonical ID and date and resets them on rollover or reenabling', () => {
    let now = time('2026-11-19T16:00:00Z')
    const values = new Map<string, string>()
    const storage = () => ({
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    })
    const mode = createSpoilerMode(() => now, storage)
    const selected = game('2026-11-19')
    const rescheduled = game('2026-11-18')
    const other = game('2026-11-19', 'final', 'bbs:game:2')
    expect(mode.enabled.value).toBe(false)
    mode.toggle()
    expect(mode.hideGame(selected)).toBe(true)
    mode.revealAggregate('standings')
    expect(mode.hideAggregate('standings')).toBe(false)
    expect(mode.hideGame(selected)).toBe(true)
    mode.revealGame(selected)
    const restored = createSpoilerMode(() => now, storage)
    expect(restored.hideGame(selected)).toBe(false)
    expect(restored.hideGame(rescheduled)).toBe(true)
    expect(restored.hideGame(other)).toBe(true)
    expect(restored.hideAggregate('news:titles')).toBe(true)
    now = time('2026-11-20T05:00:00Z')
    restored.updateClock()
    expect(restored.hideGame(selected)).toBe(true)
    expect(restored.hideAggregate('standings')).toBe(true)
    expect(JSON.parse(values.get(SPOILER_STORAGE_KEY) ?? '{}').games).toEqual([])
    restored.revealGame(selected)
    restored.toggle()
    restored.toggle()
    expect(restored.hideGame(selected)).toBe(true)
  })

  it('uses memory if localStorage cannot be accessed', () => {
    const mode = createSpoilerMode(
      () => time('2026-11-19T16:00:00Z'),
      () => {
        throw new Error('storage disabled')
      },
    )
    mode.toggle()
    expect(mode.enabled.value).toBe(true)
    const yesterday = game('2026-11-18')
    expect(mode.hideGame(yesterday)).toBe(true)
    mode.revealGame(yesterday)
    expect(mode.hideGame(yesterday)).toBe(false)
    expect(mode.hideCompleted({ id: null, nbaGameDate: yesterday.nbaGameDate })).toBe(true)
  })
})
