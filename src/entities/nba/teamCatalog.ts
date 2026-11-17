import type { NbaTeamReference, TeamId } from './model'

type TeamSeed = Omit<NbaTeamReference, 'team'>

// Conference and division assignment follows NBA.com's current league directory.
// BBS's audited team-season and standings responses returned null conference/division values.
const teams: readonly TeamSeed[] = [
  { code: 'ATL', name: 'Atlanta Hawks', conference: 'east', division: 'Southeast' },
  { code: 'BKN', name: 'Brooklyn Nets', conference: 'east', division: 'Atlantic' },
  { code: 'BOS', name: 'Boston Celtics', conference: 'east', division: 'Atlantic' },
  { code: 'CHA', name: 'Charlotte Hornets', conference: 'east', division: 'Southeast' },
  { code: 'CHI', name: 'Chicago Bulls', conference: 'east', division: 'Central' },
  { code: 'CLE', name: 'Cleveland Cavaliers', conference: 'east', division: 'Central' },
  { code: 'DAL', name: 'Dallas Mavericks', conference: 'west', division: 'Southwest' },
  { code: 'DEN', name: 'Denver Nuggets', conference: 'west', division: 'Northwest' },
  { code: 'DET', name: 'Detroit Pistons', conference: 'east', division: 'Central' },
  { code: 'GSW', name: 'Golden State Warriors', conference: 'west', division: 'Pacific' },
  { code: 'HOU', name: 'Houston Rockets', conference: 'west', division: 'Southwest' },
  { code: 'IND', name: 'Indiana Pacers', conference: 'east', division: 'Central' },
  { code: 'LAC', name: 'LA Clippers', conference: 'west', division: 'Pacific' },
  { code: 'LAL', name: 'Los Angeles Lakers', conference: 'west', division: 'Pacific' },
  { code: 'MEM', name: 'Memphis Grizzlies', conference: 'west', division: 'Southwest' },
  { code: 'MIA', name: 'Miami Heat', conference: 'east', division: 'Southeast' },
  { code: 'MIL', name: 'Milwaukee Bucks', conference: 'east', division: 'Central' },
  { code: 'MIN', name: 'Minnesota Timberwolves', conference: 'west', division: 'Northwest' },
  { code: 'NOP', name: 'New Orleans Pelicans', conference: 'west', division: 'Southwest' },
  { code: 'NYK', name: 'New York Knicks', conference: 'east', division: 'Atlantic' },
  { code: 'OKC', name: 'Oklahoma City Thunder', conference: 'west', division: 'Northwest' },
  { code: 'ORL', name: 'Orlando Magic', conference: 'east', division: 'Southeast' },
  { code: 'PHI', name: 'Philadelphia 76ers', conference: 'east', division: 'Atlantic' },
  { code: 'PHX', name: 'Phoenix Suns', conference: 'west', division: 'Pacific' },
  { code: 'POR', name: 'Portland Trail Blazers', conference: 'west', division: 'Northwest' },
  { code: 'SAC', name: 'Sacramento Kings', conference: 'west', division: 'Pacific' },
  { code: 'SAS', name: 'San Antonio Spurs', conference: 'west', division: 'Southwest' },
  { code: 'TOR', name: 'Toronto Raptors', conference: 'east', division: 'Atlantic' },
  { code: 'UTA', name: 'Utah Jazz', conference: 'west', division: 'Northwest' },
  { code: 'WAS', name: 'Washington Wizards', conference: 'east', division: 'Southeast' },
]

export const NBA_TEAMS: readonly NbaTeamReference[] = teams.map((team) => ({
  ...team,
  team: {
    id: `nba:team:${team.code}` as TeamId,
    providerId: null,
    abbreviation: team.code,
    displayName: team.name,
  },
}))

export function findNbaTeam(code: string): NbaTeamReference | null {
  return NBA_TEAMS.find((team) => team.code === code.trim().toUpperCase()) ?? null
}
