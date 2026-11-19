import rawDirectory from './teamEncyclopedia.json'
import { NBA_TEAMS } from './teamCatalog'
import type { NbaTeamReference } from './model'

export interface SourcedFact<T> {
  value: T | null
  sourceUrl: string
  asOf: string
  unit: string | null
  nullable: boolean
}

export interface TeamEncyclopediaEntry {
  code: string
  canonicalTeamId: string
  wikidata: SourcedFact<string>
  city: SourcedFact<string>
  arena: SourcedFact<string>
  pilot: boolean
}

interface TeamEncyclopediaDocument {
  schemaVersion: number
  asOf: string
  identityScope: 'active-franchise'
  teams: TeamEncyclopediaEntry[]
}

const document = rawDirectory as TeamEncyclopediaDocument

export const NBA_TEAM_ENCYCLOPEDIA: readonly TeamEncyclopediaEntry[] = document.teams

export function getTeamEncyclopediaEntry(code: string): TeamEncyclopediaEntry | null {
  return NBA_TEAM_ENCYCLOPEDIA.find((entry) => entry.code === code.trim().toUpperCase()) ?? null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  )
}

function validFact(value: unknown, errors: string[], path: string): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return
  }

  const nullable = value.nullable === true
  if (typeof value.nullable !== 'boolean') errors.push(`${path}.nullable must be boolean`)
  if (
    value.value === null ? !nullable : typeof value.value !== 'string' || value.value.trim() === ''
  ) {
    errors.push(`${path}.value must be a non-empty string${nullable ? ' or null' : ''}`)
  }
  if (typeof value.sourceUrl !== 'string' || !isHttpsUrl(value.sourceUrl)) {
    errors.push(`${path}.sourceUrl must be an HTTPS URL`)
  }
  if (!isIsoDate(value.asOf)) errors.push(`${path}.asOf must be an ISO date`)
  if (value.unit !== null && (typeof value.unit !== 'string' || value.unit.trim() === '')) {
    errors.push(`${path}.unit must be a non-empty string or null`)
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

/** Returns all structural and referential errors; does not make network requests. */
export function validateTeamEncyclopedia(
  input: unknown,
  catalog: readonly NbaTeamReference[] = NBA_TEAMS,
): string[] {
  const errors: string[] = []
  if (!isRecord(input)) return ['document must be an object']
  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1')
  if (!isIsoDate(input.asOf)) errors.push('asOf must be an ISO date')
  if (input.identityScope !== 'active-franchise')
    errors.push('identityScope must be active-franchise')
  if (!Array.isArray(input.teams)) return [...errors, 'teams must be an array']
  if (input.teams.length !== 30 || catalog.length !== 30)
    errors.push('directory and canonical catalog must each contain 30 teams')

  const expectedByCode = new Map(catalog.map((team) => [team.code, team]))
  const seenCodes = new Set<string>()
  const seenIds = new Set<string>()
  const seenQids = new Set<string>()
  const pilotCodes = new Set<string>()

  input.teams.forEach((unknownEntry, index) => {
    const path = `teams[${index}]`
    if (!isRecord(unknownEntry)) {
      errors.push(`${path} must be an object`)
      return
    }
    const entry = unknownEntry
    if (typeof entry.code !== 'string' || !/^[A-Z]{3}$/.test(entry.code)) {
      errors.push(`${path}.code must be a three-letter uppercase team code`)
    } else {
      if (seenCodes.has(entry.code)) errors.push(`duplicate team code ${entry.code}`)
      seenCodes.add(entry.code)
      const canonical = expectedByCode.get(entry.code)
      if (!canonical) errors.push(`unknown canonical team code ${entry.code}`)
      else if (entry.canonicalTeamId !== canonical.team.id)
        errors.push(`${path}.canonicalTeamId does not match ${entry.code}`)
    }
    if (
      typeof entry.canonicalTeamId !== 'string' ||
      !/^nba:team:[A-Z]{3}$/.test(entry.canonicalTeamId)
    ) {
      errors.push(`${path}.canonicalTeamId must use the NBA team ID format`)
    } else {
      if (seenIds.has(entry.canonicalTeamId))
        errors.push(`duplicate canonical team ID ${entry.canonicalTeamId}`)
      seenIds.add(entry.canonicalTeamId)
    }

    validFact(entry.wikidata, errors, `${path}.wikidata`)
    if (isRecord(entry.wikidata) && typeof entry.wikidata.value === 'string') {
      if (!/^Q\d+$/.test(entry.wikidata.value))
        errors.push(`${path}.wikidata.value must be a Wikidata QID`)
      if (seenQids.has(entry.wikidata.value))
        errors.push(`duplicate Wikidata QID ${entry.wikidata.value}`)
      seenQids.add(entry.wikidata.value)
      if (entry.wikidata.sourceUrl !== `https://www.wikidata.org/wiki/${entry.wikidata.value}`) {
        errors.push(`${path}.wikidata.sourceUrl must point to the corresponding Wikidata entity`)
      }
    }
    validFact(entry.city, errors, `${path}.city`)
    validFact(entry.arena, errors, `${path}.arena`)
    if (typeof entry.pilot !== 'boolean') errors.push(`${path}.pilot must be boolean`)
    else if (entry.pilot && typeof entry.code === 'string') pilotCodes.add(entry.code)
  })

  for (const code of expectedByCode.keys()) {
    if (!seenCodes.has(code)) errors.push(`missing canonical team ${code}`)
  }
  for (const pilot of ['CHI', 'LAL', 'MIN']) {
    if (!pilotCodes.has(pilot)) errors.push(`pilot team ${pilot} is missing`)
  }
  return errors
}

export function assertValidTeamEncyclopedia(
  input: unknown = document,
): asserts input is TeamEncyclopediaDocument {
  const errors = validateTeamEncyclopedia(input)
  if (errors.length > 0) throw new Error(`Invalid NBA team encyclopedia: ${errors.join('; ')}`)
}

assertValidTeamEncyclopedia()
