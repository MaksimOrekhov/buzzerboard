import { describe, expect, it } from 'vitest'
import { NBA_TEAMS } from './teamCatalog'
import {
  appointmentCoversDate,
  COACHING_DIRECTORY,
  coachingSourceIsStale,
  getTeamCoaching,
  validateCoachingDirectory,
} from './coachingDirectory'

describe('coaching directory', () => {
  it('has a sourced head coach and selected staff on each of the 30 canonical team profiles', () => {
    expect(validateCoachingDirectory()).toEqual([])
    expect(NBA_TEAMS).toHaveLength(30)
    for (const { team, code } of NBA_TEAMS) {
      const profile = getTeamCoaching(code)
      expect(profile?.head).toMatchObject({ teamId: team.id, role: 'head-coach', phase: 'current' })
      expect(profile?.staff.some(({ role }) => role === 'assistant-coach')).toBe(true)
      const cited = COACHING_DIRECTORY.sources[profile!.head!.source]
      expect(cited?.asOf).toBe(COACHING_DIRECTORY.asOf)
      expect(cited?.url).toMatch(/^https:\/\//)
    }
    expect(getTeamCoaching('unknown')).toBeNull()
  })

  it('keeps the same person across teams and distinguishes interim and permanent periods', () => {
    const chicago = getTeamCoaching('CHI')!.head!
    const portland = getTeamCoaching('POR')!.history.find(
      ({ personId }) => personId === chicago.personId,
    )!
    expect(portland).toMatchObject({
      teamId: 'nba:team:POR',
      personId: chicago.personId,
      phase: 'former',
      status: 'interim',
    })
    expect(chicago.status).toBe('permanent')

    const boston = getTeamCoaching('BOS')!
    const interim = boston.history.find(({ status }) => status === 'interim')!
    const current = boston.head!
    expect(interim.personId).toBe(current.personId)
    expect(appointmentCoversDate(interim, '2022-09-21')).toBe(false)
    expect(appointmentCoversDate(interim, '2022-09-22')).toBe(true)
    expect(appointmentCoversDate(interim, '2023-02-16')).toBe(false)
    expect(appointmentCoversDate(current, '2023-02-16')).toBe(true)
  })

  it('preserves unknown dates without inferring an open historical appointment', () => {
    const former = getTeamCoaching('BKN')!.history.find(
      ({ personId }) => personId === 'nba:person:kevin-ollie',
    )!
    expect(former.validUntil).toBeNull()
    expect(appointmentCoversDate(former, '2024-04-22')).toBe(false)
    expect(appointmentCoversDate({ ...former, validFrom: null }, '2024-02-29')).toBe(false)
    expect(appointmentCoversDate(former, '2024-02-30')).toBe(false)
    expect(COACHING_DIRECTORY.people['nba:person:micah-nori']?.birthDate).toBeNull()
  })

  it('detects stale sources, ID and role conflicts, duplicate current heads and overlapping intervals', () => {
    expect(coachingSourceIsStale('2026-11-23', '2026-11-30')).toBe(false)
    expect(coachingSourceIsStale('2026-11-23', '2026-12-01')).toBe(true)
    expect(coachingSourceIsStale('2026-02-31', '2026-12-01')).toBe(true)
    const data = structuredClone(COACHING_DIRECTORY)
    const current = data.assignments.find(
      (r) => r.teamId === 'nba:team:BOS' && r.phase === 'current' && r.role === 'head-coach',
    )!
    const former = data.assignments.find(
      (r) => r.teamId === 'nba:team:BOS' && r.status === 'interim',
    )!
    data.sources[current.source]!.asOf = '2026-11-01'
    former.validUntil = '2023-02-17'
    data.assignments.push({ ...current, role: 'assistant-coach', status: 'interim' })
    data.assignments.push({ ...current, personId: 'nba:person:unknown' })
    expect(validateCoachingDirectory(data)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'invalid assignment: nba:team:BOS/nba:person:joe-mazzulla/assistant-coach',
        ),
        expect.stringContaining('invalid assignment: nba:team:BOS/nba:person:unknown'),
        'expected one current head coach: nba:team:BOS',
        'overlapping head coach appointments: nba:team:BOS',
      ]),
    )
    data.assignments.pop()
    expect(validateCoachingDirectory(data)).toContain(
      'stale current head coach source: nba:team:BOS',
    )
  })
})
