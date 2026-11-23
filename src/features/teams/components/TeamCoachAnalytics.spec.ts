import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { calculateCoachRecord, type CoachGameWindow } from '@/entities/nba/coachAnalytics'
import { COACHING_DIRECTORY, getTeamCoaching } from '@/entities/nba/coachingDirectory'
import { useSpoilerMode } from '@/features/spoilers/useSpoilerMode'
import TeamCoachAnalytics from './TeamCoachAnalytics.vue'

const appointment = getTeamCoaching('CHI')!.head!
const verifiedAt = COACHING_DIRECTORY.asOf
const home = { date: '2026-10-31', homeTeamId: 'nba:team:CHI', awayTeamId: 'nba:team:BOS' }
const away = { date: '2026-11-01', homeTeamId: 'nba:team:MIN', awayTeamId: 'nba:team:CHI' }
const gameWindow: CoachGameWindow = {
  teamId: appointment.teamId,
  source: 'd1',
  stage: 'regular-season',
  from: home.date,
  through: away.date,
  asOf: '2026-11-02',
  seasonEndYear: 2027,
  scheduleUrl: 'https://www.nba.com/news/2026-27-schedule-team-by-team-index',
  expected: [home, away],
  games: [
    {
      ...home,
      id: 'home',
      startsAt: '2026-11-01T01:00:00Z',
      seasonEndYear: 2027,
      status: 'final',
      homePoints: 111,
      awayPoints: 99,
    },
    {
      ...away,
      id: 'away',
      startsAt: '2026-11-02T01:00:00Z',
      seasonEndYear: 2027,
      status: 'final',
      homePoints: 121,
      awayPoints: 101,
    },
  ],
}

const { enabled, toggle } = useSpoilerMode()
afterEach(() => {
  if (enabled.value) toggle()
})

describe('verified coaching record', () => {
  it('counts only matched finals and respects ET across the DST/UTC date boundaries', () => {
    expect(calculateCoachRecord(appointment, gameWindow, verifiedAt)).toMatchObject({
      wins: 1,
      losses: 1,
      gp: 2,
      winRate: 0.5,
      home: { wins: 1, losses: 0 },
      away: { wins: 0, losses: 1 },
      months: [
        ['2026-10', { wins: 1, losses: 0 }],
        ['2026-11', { wins: 0, losses: 1 }],
      ],
    })
  })

  it('withholds records with partial, non-final, misdated, duplicate or wrong-season cache rows', () => {
    expect(calculateCoachRecord(appointment, null, verifiedAt)).toBeNull()
    expect(
      calculateCoachRecord(
        appointment,
        { ...gameWindow, games: gameWindow.games.slice(1) },
        verifiedAt,
      ),
    ).toBeNull()
    for (const changes of [
      { status: 'live' },
      { startsAt: '2026-11-01T05:00:00Z' },
      { seasonEndYear: 2026 },
      { id: 'away' },
    ]) {
      expect(
        calculateCoachRecord(
          appointment,
          {
            ...gameWindow,
            games: [{ ...gameWindow.games[0]!, ...changes }, gameWindow.games[1]!],
          },
          verifiedAt,
        ),
      ).toBeNull()
    }
    expect(
      calculateCoachRecord(appointment, { ...gameWindow, from: '2026-07-31' }, verifiedAt),
    ).toBeNull()
  })

  it('withholds records across a change of coach, missing or unverified appointment dates', () => {
    expect(
      calculateCoachRecord({ ...appointment, validFrom: '2026-11-01' }, gameWindow, verifiedAt),
    ).toBeNull()
    expect(
      calculateCoachRecord(
        { ...appointment, phase: 'former', validUntil: '2026-11-01' },
        gameWindow,
        verifiedAt,
      ),
    ).toBeNull()
    expect(
      calculateCoachRecord({ ...appointment, validFrom: null }, gameWindow, verifiedAt),
    ).toBeNull()
    expect(calculateCoachRecord(appointment, gameWindow, '2026-10-31')).toBeNull()
  })

  it('removes the record, period and splits from the DOM in Spoiler Mode', async () => {
    const wrapper = mount(TeamCoachAnalytics, { props: { appointment, gameWindow } })
    expect(wrapper.text()).toContain('GP 2')
    expect(wrapper.text()).toContain('50')
    expect(wrapper.find('.coach-stats').exists()).toBe(true)
    toggle()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Результаты скрыты')
    expect(wrapper.find('.coach-stats').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('GP 2')
    expect(wrapper.html()).not.toContain('2026-10-31')
    wrapper.unmount()
  })
})
