import type { PlayerBoxScore, TeamBoxScore } from './model'
import type { AdvancedMetric, AdvancedStatsMetric, Per36Metric, PlayerStats } from './players'

export type { AdvancedMetric, AdvancedStatsMetric, Per36Metric } from './players'

export const advancedMetrics = [
  {
    key: 'ts',
    short: 'TS%',
    label: 'Истинная точность броска',
    description:
      'PTS / (2 × (FGA + 0,44 × FTA)); 0,44 — оценка вклада штрафных в бросковые владения.',
    format: 'percent',
  },
  {
    key: 'efg',
    short: 'eFG%',
    label: 'Эффективность бросков с игры',
    description: '(FGM + 0,5 × 3PM) / FGA; учитывает дополнительную ценность трёхочкового.',
    format: 'percent',
  },
  {
    key: 'astTo',
    short: 'AST/TO',
    label: 'Передачи к потерям',
    description: 'AST / TOV. При нуле потерь отношение не определено и показано как «—».',
    format: 'number',
  },
  {
    key: 'gmSc',
    short: 'GmSc/игру (оценка)',
    label: 'Game Score за игру (оценка)',
    description:
      'Оценка Джона Холлинджера для одной игры; сезонное значение линейно рассчитано по средним BBS.',
    format: 'number',
  },
  {
    key: 'threeRate',
    short: '3PAr',
    label: 'Доля трёхочковых попыток',
    description: '3PA / FGA. Доля бросков с игры, пришедшихся на трёхочковые.',
    format: 'percent',
  },
  {
    key: 'freeThrowRate',
    short: 'FTr',
    label: 'Штрафные попытки к броскам с игры',
    description: 'FTA / FGA; показатель может быть выше 100%.',
    format: 'percent',
  },
  {
    key: 'twoPoint',
    short: '2P%',
    label: 'Точность двухочковых',
    description: '(FGM − 3PM) / (FGA − 3PA); доступна только при валидных данных бросков.',
    format: 'percent',
  },
] as const satisfies readonly {
  key: AdvancedMetric
  short: string
  label: string
  description: string
  format: 'percent' | 'number'
}[]

export const gameAdvancedMetrics = advancedMetrics.map((metric) =>
  metric.key === 'gmSc'
    ? {
        ...metric,
        short: 'GmSc',
        label: 'Game Score за матч',
        description:
          'Оценка Джона Холлинджера для одной игры, рассчитанная по полному box score матча.',
      }
    : metric,
)

export const per36Metrics = [
  { key: 'pts36', short: 'PTS/36', label: 'Очки за 36 минут', source: 'pts' },
  { key: 'reb36', short: 'REB/36', label: 'Подборы за 36 минут', source: 'reb' },
  { key: 'ast36', short: 'AST/36', label: 'Передачи за 36 минут', source: 'ast' },
  { key: 'stl36', short: 'STL/36', label: 'Перехваты за 36 минут', source: 'stl' },
  { key: 'blk36', short: 'BLK/36', label: 'Блок-шоты за 36 минут', source: 'blk' },
] as const satisfies readonly {
  key: Per36Metric
  short: string
  label: string
  source: 'pts' | 'reb' | 'ast' | 'stl' | 'blk'
}[]

export interface BoxScoreAdvancedInputs {
  points: number | null
  fieldGoals: { made: number | null; attempted: number | null }
  threePointers: { made: number | null; attempted: number | null }
  freeThrows: { made: number | null; attempted: number | null }
  rebounds: number | null
  offensiveRebounds: number | null
  defensiveRebounds: number | null
  assists: number | null
  steals: number | null
  blocks: number | null
  turnovers: number | null
  fouls: number | null
}

function validNonnegative(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}

type Precision = 'exact' | 'rounded'

function tolerance(precision: Precision): number {
  return precision === 'rounded' ? 0.1 : 0
}

function validShooting(
  line: BoxScoreAdvancedInputs['fieldGoals'],
  allowedTolerance: number,
  requireMade = true,
): boolean {
  if (!validNonnegative(line.attempted) || (requireMade && !validNonnegative(line.made)))
    return false
  return (
    line.made === null ||
    (validNonnegative(line.made) && line.made <= line.attempted + allowedTolerance)
  )
}

function validKnownThreePointLine(line: BoxScoreAdvancedInputs, allowedTolerance: number): boolean {
  const { made, attempted } = line.threePointers
  if (attempted !== null && !validShooting(line.threePointers, allowedTolerance, false))
    return false
  if (made !== null && !validNonnegative(made)) return false
  if (
    made !== null &&
    line.fieldGoals.made !== null &&
    made > line.fieldGoals.made + allowedTolerance
  )
    return false
  if (
    attempted !== null &&
    line.fieldGoals.attempted !== null &&
    attempted > line.fieldGoals.attempted + allowedTolerance
  )
    return false
  return true
}

function shotInputsValid(
  line: BoxScoreAdvancedInputs,
  metric: AdvancedMetric,
  allowedTolerance: number,
): boolean {
  if (metric === 'efg') {
    return (
      validNonnegative(line.fieldGoals.made) &&
      validNonnegative(line.fieldGoals.attempted) &&
      validNonnegative(line.threePointers.made) &&
      line.fieldGoals.made <= line.fieldGoals.attempted + allowedTolerance &&
      validKnownThreePointLine(line, allowedTolerance)
    )
  }
  if (metric === 'ts') {
    return (
      validNonnegative(line.points) &&
      validShooting(line.fieldGoals, allowedTolerance, false) &&
      validShooting(line.freeThrows, allowedTolerance, false) &&
      validKnownThreePointLine(line, allowedTolerance)
    )
  }
  if (metric === 'threeRate') {
    return (
      validShooting(line.fieldGoals, allowedTolerance, false) &&
      validShooting(line.threePointers, allowedTolerance, false) &&
      validKnownThreePointLine(line, allowedTolerance)
    )
  }
  if (metric === 'freeThrowRate')
    return (
      validShooting(line.fieldGoals, allowedTolerance, false) &&
      validShooting(line.freeThrows, allowedTolerance, false)
    )
  if (metric === 'twoPoint') {
    if (
      !validShooting(line.fieldGoals, allowedTolerance) ||
      !validShooting(line.threePointers, allowedTolerance) ||
      !validKnownThreePointLine(line, allowedTolerance)
    )
      return false
    const made = line.fieldGoals.made! - line.threePointers.made!
    const attempts = line.fieldGoals.attempted! - line.threePointers.attempted!
    return (
      made >= -allowedTolerance &&
      attempts >= -allowedTolerance &&
      made <= attempts + 2 * allowedTolerance
    )
  }
  return true
}

export function calculateBoxScoreAdvanced(
  line: BoxScoreAdvancedInputs,
  metric: AdvancedMetric,
  options: { precision?: Precision } = {},
): number | null {
  const allowedTolerance = tolerance(options.precision ?? 'exact')
  if (metric === 'astTo') {
    if (
      !validNonnegative(line.assists) ||
      !validNonnegative(line.turnovers) ||
      line.turnovers === 0
    )
      return null
    return line.assists / line.turnovers
  }
  if (metric === 'gmSc') {
    const required = [
      line.points,
      line.fieldGoals.made,
      line.fieldGoals.attempted,
      line.freeThrows.made,
      line.freeThrows.attempted,
      line.offensiveRebounds,
      line.defensiveRebounds,
      line.steals,
      line.assists,
      line.blocks,
      line.fouls,
      line.turnovers,
    ]
    if (
      !required.every(validNonnegative) ||
      !validShooting(line.fieldGoals, allowedTolerance) ||
      !validShooting(line.freeThrows, allowedTolerance) ||
      !validKnownThreePointLine(line, allowedTolerance)
    )
      return null
    return (
      line.points! +
      0.4 * line.fieldGoals.made! -
      0.7 * line.fieldGoals.attempted! -
      0.4 * (line.freeThrows.attempted! - line.freeThrows.made!) +
      0.7 * line.offensiveRebounds! +
      0.3 * line.defensiveRebounds! +
      line.steals! +
      0.7 * line.assists! +
      0.7 * line.blocks! -
      0.4 * line.fouls! -
      line.turnovers!
    )
  }
  if (!shotInputsValid(line, metric, allowedTolerance)) return null
  const fga = line.fieldGoals.attempted!
  if (metric === 'efg')
    return fga === 0 ? null : (line.fieldGoals.made! + 0.5 * line.threePointers.made!) / fga
  if (metric === 'ts') {
    const denominator = 2 * (fga + 0.44 * line.freeThrows.attempted!)
    return denominator === 0 ? null : line.points! / denominator
  }
  if (metric === 'threeRate') return fga === 0 ? null : line.threePointers.attempted! / fga
  if (metric === 'freeThrowRate') return fga === 0 ? null : line.freeThrows.attempted! / fga
  const attempts = fga - line.threePointers.attempted!
  const made = line.fieldGoals.made! - line.threePointers.made!
  return attempts <= 0 || made < 0 || made > attempts + 2 * allowedTolerance
    ? null
    : made / attempts
}

export function parseMinutes(value: number | string | null): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  const trimmed = value.trim()
  const clock = /^(\d+):(\d{1,2})$/.exec(trimmed)
  if (clock && Number(clock[2]) < 60) return Number(clock[1]) + Number(clock[2]) / 60
  const minutes = Number(trimmed)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : null
}

function seasonInputs(stats: PlayerStats): BoxScoreAdvancedInputs {
  return {
    points: stats.pts,
    fieldGoals: { made: stats.fgm, attempted: stats.fga },
    threePointers: { made: stats.threeM, attempted: stats.threeA },
    freeThrows: { made: stats.ftm, attempted: stats.fta },
    rebounds: stats.reb,
    offensiveRebounds: stats.oreb,
    defensiveRebounds: stats.dreb,
    assists: stats.ast,
    steals: stats.stl,
    blocks: stats.blk,
    turnovers: stats.tov,
    fouls: stats.pf,
  }
}

export function seasonAdvancedMetric(
  stats: PlayerStats,
  metric: AdvancedStatsMetric,
): number | null {
  if (!validNonnegative(stats.gp) || stats.gp === 0) return null
  if (
    metric === 'pts36' ||
    metric === 'reb36' ||
    metric === 'ast36' ||
    metric === 'stl36' ||
    metric === 'blk36'
  ) {
    if (!validNonnegative(stats.min) || stats.min === 0) return null
    const source = per36Metrics.find((item) => item.key === metric)!.source
    const value = stats[source]
    return validNonnegative(value) ? (value * 36) / stats.min : null
  }
  return calculateBoxScoreAdvanced(seasonInputs(stats), metric, { precision: 'rounded' })
}

export function playerBoxScoreAdvanced(
  line: PlayerBoxScore,
  metric: AdvancedMetric,
): number | null {
  if (line.didNotPlay === true) return null
  return calculateBoxScoreAdvanced(line, metric)
}

export function teamBoxScoreAdvanced(
  line: TeamBoxScore | null,
  metric: Exclude<AdvancedMetric, 'gmSc' | 'twoPoint'>,
): number | null {
  return line ? calculateBoxScoreAdvanced(line, metric) : null
}

export function formatAdvancedStat(
  metric: AdvancedStatsMetric,
  value: number | null | undefined,
): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const percent = advancedMetrics.some((item) => item.key === metric && item.format === 'percent')
  return percent
    ? new Intl.NumberFormat('ru', { style: 'percent', maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(value)
}

export function seasonAdvancedMetrics(
  stats: PlayerStats | null,
): Record<AdvancedStatsMetric, number | null> {
  return Object.fromEntries(
    [...advancedMetrics.map(({ key }) => key), ...per36Metrics.map(({ key }) => key)].map((key) => [
      key,
      stats ? seasonAdvancedMetric(stats, key) : null,
    ]),
  ) as Record<AdvancedStatsMetric, number | null>
}

export function meetsPlayerThresholds(
  stats: PlayerStats | null,
  thresholds: { gp?: number; minutes?: number; fga?: number },
): boolean {
  const { gp = 0, minutes = 0, fga = 0 } = thresholds
  if (gp <= 0 && minutes <= 0 && fga <= 0) return true
  return Boolean(
    stats &&
    (gp <= 0 || (validNonnegative(stats.gp) && stats.gp >= gp)) &&
    (minutes <= 0 || (validNonnegative(stats.min) && stats.min >= minutes)) &&
    (fga <= 0 || (validNonnegative(stats.fga) && stats.fga >= fga)),
  )
}
