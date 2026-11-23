import { shiftNbaGameDate } from '@/shared/utils/nbaDate'
import rawDirectory from './coachingDirectory.json'
import { getTeamEncyclopediaEntry, NBA_TEAM_ENCYCLOPEDIA } from './teamEncyclopedia'
import type { CoachGameWindow } from './coachAnalytics'

export const COACHING_ROLES = {
  'head-coach': 'Главный тренер',
  'associate-head-coach': 'Ассоциированный главный тренер',
  'assistant-coach': 'Ассистент тренера',
  'general-manager': 'Генеральный менеджер',
  'basketball-president': 'Президент по баскетбольным операциям',
  'basketball-evp': 'Исполнительный вице-президент по баскетбольным операциям',
  'co-owner': 'Совладелец',
  'majority-owner': 'Владелец контрольной доли',
} as const
export type CoachingRole = keyof typeof COACHING_ROLES

export interface CoachingSource {
  label: string
  url: string
  asOf: string
}

interface CoachingFact {
  value: string
  source: string
}

export interface CoachingPerson {
  name: string
  nationality: CoachingFact | null
  birthDate: CoachingFact | null
  career: CoachingFact | null
  achievement: CoachingFact | null
}

export interface CoachingAssignment {
  teamId: string
  personId: string
  role: CoachingRole
  status: 'permanent' | 'interim'
  phase: 'current' | 'former'
  validFrom: string | null
  /** First date outside this appointment. Null for an open or undated interval. */
  validUntil: string | null
  source: string
  startSource: string | null
  endSource: string | null
  season?: string
}

export interface CoachingDirectory {
  schemaVersion: number
  asOf: string
  sources: Record<string, CoachingSource>
  people: Record<string, CoachingPerson>
  assignments: CoachingAssignment[]
  verifiedGameWindows: CoachGameWindow[]
}

const directory = rawDirectory as CoachingDirectory

export const COACHING_DIRECTORY = directory
export const COACHING_PERSON_IDS = Object.keys(directory.people)

export function getTeamCoaching(teamCode: string) {
  const teamId = getTeamEncyclopediaEntry(teamCode)?.canonicalTeamId
  if (!teamId) return null
  const assignments = directory.assignments.filter((entry) => entry.teamId === teamId)
  return {
    head: assignments.find(({ role, phase }) => role === 'head-coach' && phase === 'current'),
    history: assignments.filter(({ role }) => role === 'head-coach'),
    staff: assignments.filter(({ role, phase }) => role !== 'head-coach' && phase === 'current'),
    gameWindow: directory.verifiedGameWindows.find((window) => window.teamId === teamId) ?? null,
  }
}

export function validCoachingDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(date)
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === date
}

export function coachingSourceIsStale(asOf: string, today: string): boolean {
  return (
    !validCoachingDate(asOf) ||
    !validCoachingDate(today) ||
    asOf > today ||
    shiftNbaGameDate(asOf, 7) < today
  )
}

export function appointmentCoversDate(appointment: CoachingAssignment, date: string): boolean {
  return (
    validCoachingDate(date) &&
    appointment.validFrom !== null &&
    validCoachingDate(appointment.validFrom) &&
    date >= appointment.validFrom &&
    (appointment.validUntil === null
      ? appointment.phase === 'current'
      : validCoachingDate(appointment.validUntil) && date < appointment.validUntil)
  )
}

function isOfficialSource({ url, label, asOf }: CoachingSource, directoryDate: string): boolean {
  try {
    const { protocol, hostname, pathname, username, password, port } = new URL(url)
    return (
      protocol === 'https:' &&
      (hostname === 'nba.com' || hostname.endsWith('.nba.com')) &&
      pathname.length > 1 &&
      !username &&
      !password &&
      !port &&
      label.trim().length > 0 &&
      validCoachingDate(asOf) &&
      asOf <= directoryDate
    )
  } catch {
    return false
  }
}

export function validateCoachingDirectory(input: CoachingDirectory = directory): string[] {
  const errors: string[] = []
  const hasSource = (ref: string | null) => ref !== null && Object.hasOwn(input.sources, ref)
  const teamIds = new Set(NBA_TEAM_ENCYCLOPEDIA.map(({ canonicalTeamId }) => canonicalTeamId))
  if (input.schemaVersion !== 1 || !validCoachingDate(input.asOf)) errors.push('invalid metadata')
  for (const [id, source] of Object.entries(input.sources)) {
    if (!isOfficialSource(source, input.asOf)) errors.push(`invalid source: ${id}`)
  }
  for (const [id, person] of Object.entries(input.people)) {
    if (!/^nba:person:[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !person.name.trim())
      errors.push(`invalid person: ${id}`)
    const facts = [person.nationality, person.birthDate, person.career, person.achievement]
    if (
      facts.some((fact) => fact !== null && (!fact.value.trim() || !hasSource(fact.source))) ||
      (person.birthDate !== null &&
        (!validCoachingDate(person.birthDate.value) || person.birthDate.value > input.asOf))
    )
      errors.push(`invalid biographical fact: ${id}`)
  }

  const seen = new Set<string>()
  for (const item of input.assignments) {
    const {
      teamId,
      personId,
      role,
      phase,
      status,
      validFrom,
      validUntil,
      source,
      startSource,
      endSource,
    } = item
    const key = `${teamId}/${personId}/${role}/${status}/${validFrom}`
    if (
      seen.has(key) ||
      !teamIds.has(teamId) ||
      !Object.hasOwn(input.people, personId) ||
      !Object.hasOwn(COACHING_ROLES, role) ||
      !['current', 'former'].includes(phase) ||
      !['permanent', 'interim'].includes(status) ||
      (status === 'interim' && role !== 'head-coach') ||
      !hasSource(source) ||
      (validFrom !== null &&
        (!validCoachingDate(validFrom) || validFrom > input.asOf || !hasSource(startSource))) ||
      (validFrom === null && startSource !== null) ||
      (validUntil !== null &&
        (!validCoachingDate(validUntil) || validUntil > input.asOf || !hasSource(endSource))) ||
      (validUntil === null && endSource !== null) ||
      (validFrom !== null && validUntil !== null && validFrom >= validUntil) ||
      (phase === 'current' && validUntil !== null) ||
      (item.season !== undefined &&
        (!/^\d{4}\/\d{2}$/.test(item.season) ||
          String(Number(item.season.slice(0, 4)) + 1).slice(-2) !== item.season.slice(-2)))
    )
      errors.push(`invalid assignment: ${key}`)
    seen.add(key)
  }

  const activeHeadIds = new Set<string>()
  for (const teamId of teamIds) {
    const headCoaches = input.assignments.filter(
      (item) => item.teamId === teamId && item.role === 'head-coach',
    )
    const current = headCoaches.filter(({ phase }) => phase === 'current')
    if (current.length !== 1) {
      errors.push(`expected one current head coach: ${teamId}`)
    } else {
      const head = current[0]!
      if (activeHeadIds.has(head.personId))
        errors.push(`current head coach on multiple teams: ${head.personId}`)
      activeHeadIds.add(head.personId)
      const source = input.sources[head.source]
      if (source && coachingSourceIsStale(source.asOf, input.asOf))
        errors.push(`stale current head coach source: ${teamId}`)
    }

    const known = headCoaches
      .filter(
        ({ validFrom, validUntil, phase }) =>
          validFrom !== null && (validUntil !== null || phase === 'current'),
      )
      .sort((a, b) => (a.validFrom ?? '').localeCompare(b.validFrom ?? ''))
    const overlap = known.some(
      (item, i) =>
        i > 0 &&
        (known[i - 1]?.validUntil === null ||
          (known[i - 1]?.validUntil ?? '') > (item.validFrom ?? '')),
    )
    if (overlap) errors.push(`overlapping head coach appointments: ${teamId}`)
  }
  return errors
}
