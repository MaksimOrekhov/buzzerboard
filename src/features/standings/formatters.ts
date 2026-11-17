export function formatNumber(value: number | null): string {
  return value === null
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value)
}
export function formatPercentage(value: number | null): string {
  if (value === null || value < 0 || value > 1) return '—'
  return value.toFixed(3).replace(/^0\./, '.')
}
export function formatRecord(wins: number | null, losses: number | null): string {
  return wins === null || losses === null ? '—' : `${formatNumber(wins)}–${formatNumber(losses)}`
}
export function formatAverageMargin(value: number | null): string {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}`
}
export function formatLastTen(wins: number | null): string {
  if (wins === null || !Number.isInteger(wins) || wins < 0 || wins > 10) return '—'
  return `${wins} ${wins === 1 ? 'победа' : wins >= 2 && wins <= 4 ? 'победы' : 'побед'}`
}
export function formatGamesBehind(value: number | undefined): string {
  return value === undefined
    ? '—'
    : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(value)
}
