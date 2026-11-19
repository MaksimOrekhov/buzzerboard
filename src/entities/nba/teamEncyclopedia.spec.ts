import { describe, expect, it } from 'vitest'
import rawDirectory from './teamEncyclopedia.json'
import { NBA_TEAMS } from './teamCatalog'
import { getTeamEncyclopediaEntry, validateTeamEncyclopedia } from './teamEncyclopedia'

function copyDirectory(): typeof rawDirectory {
  return structuredClone(rawDirectory)
}

describe('NBA team encyclopedia directory', () => {
  it('maps all 30 canonical NBA teams and the three reviewed pilot examples', () => {
    expect(validateTeamEncyclopedia(rawDirectory)).toEqual([])
    expect(rawDirectory.teams).toHaveLength(30)
    expect(rawDirectory.teams.map((team) => team.canonicalTeamId).sort()).toEqual(
      NBA_TEAMS.map((team) => team.team.id).sort(),
    )
    expect(
      rawDirectory.teams
        .filter((team) => team.pilot)
        .map((team) => team.code)
        .sort(),
    ).toEqual(['CHI', 'LAL', 'MIN'])
    expect(getTeamEncyclopediaEntry(' min ')?.wikidata.value).toBe('Q170558')
  })

  it('rejects missing canonical teams, duplicate IDs, bad QIDs, and absent provenance', () => {
    const directory = copyDirectory()
    directory.teams.pop()
    directory.teams[0]!.canonicalTeamId = directory.teams[1]!.canonicalTeamId
    directory.teams[1]!.wikidata.value = 'not-a-qid'
    directory.teams[2]!.city.sourceUrl = ''

    const errors = validateTeamEncyclopedia(directory)
    expect(errors).toContain('directory and canonical catalog must each contain 30 teams')
    expect(errors).toContain('duplicate canonical team ID nba:team:BKN')
    expect(errors).toContain('teams[1].wikidata.value must be a Wikidata QID')
    expect(errors).toContain('teams[2].city.sourceUrl must be an HTTPS URL')
    expect(errors).toContain('missing canonical team WAS')
  })

  it('rejects HTTP provenance and invalid dates', () => {
    const directory = copyDirectory()
    directory.teams[0]!.arena.sourceUrl = 'http://www.nba.com'
    directory.teams[0]!.arena.asOf = 'yesterday'

    const errors = validateTeamEncyclopedia(directory)
    expect(errors).toContain('teams[0].arena.sourceUrl must be an HTTPS URL')
    expect(errors).toContain('teams[0].arena.asOf must be an ISO date')
  })
})
