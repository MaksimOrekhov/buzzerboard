import type { PlayerRefreshSummary } from '@/entities/nba/players'

export function formatFreshness(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('ru-RU') : 'нет даты'
}

const phases: Record<PlayerRefreshSummary['phase'], string> = {
  directory: 'обновляется каталог',
  averages: 'обновляются средние',
  publish: 'сохраняются средние',
  retry: 'повторная проверка отдельных игроков',
  gameRefs: 'связываются недавние матчи',
  enrich: 'обогащаются профили',
  idle: 'ожидает следующего цикла',
}

export function refreshPhaseLabel(phase: PlayerRefreshSummary['phase']) {
  return phases[phase]
}
