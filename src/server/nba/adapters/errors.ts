import type { NbaApiError, NbaApiErrorCode, NbaProviderId } from '@/entities/nba/model'

const messages: Readonly<Record<NbaApiErrorCode, string>> = {
  authentication: 'Поставщик данных отклонил авторизацию.',
  forbidden: 'Поставщик данных запретил доступ.',
  rate_limited: 'Превышен лимит запросов к поставщику данных.',
  not_found: 'Запрошенные данные NBA не найдены.',
  cache_miss: 'Данные NBA для запрошенного периода ещё не сохранены.',
  invalid_request: 'Запрос данных NBA имеет неверный формат.',
  timeout: 'Поставщик данных NBA не ответил вовремя.',
  upstream_unavailable: 'Поставщик данных NBA временно недоступен.',
  invalid_response: 'Поставщик данных NBA вернул ответ неверного формата.',
  unauthorized: 'Необходима авторизация для обновления данных NBA.',
  quota_exceeded: 'Лимит бюджета NBA API исчерпан.',
  not_configured: 'Источник данных NBA ещё не настроен.',
  refresh_in_progress: 'Обновление данных NBA уже выполняется.',
  storage_unavailable: 'Общее хранилище данных NBA временно недоступно.',
  unknown: 'Не удалось получить данные NBA.',
}

export function createNbaApiError(
  code: NbaApiErrorCode,
  provider: NbaProviderId | null,
  retryable = false,
  upstreamStatus: number | null = null,
): NbaApiError {
  return { code, message: messages[code], retryable, provider, upstreamStatus }
}

export function mapHttpStatusToNbaError(provider: NbaProviderId, status: number): NbaApiError {
  let code: NbaApiErrorCode = 'unknown'
  let retryable = false

  if (status === 401) code = 'authentication'
  else if (status === 403) code = 'forbidden'
  else if (status === 404) code = 'not_found'
  else if (status === 408 || status === 504) {
    code = 'timeout'
    retryable = true
  } else if (status === 429) {
    code = 'rate_limited'
    retryable = true
  } else if (status === 400 || status === 422) code = 'invalid_request'
  else if (status >= 500 && status <= 599) {
    code = 'upstream_unavailable'
    retryable = true
  }

  return { code, message: messages[code], retryable, provider, upstreamStatus: status }
}

export function invalidResponseError(provider: NbaProviderId): NbaApiError {
  return {
    code: 'invalid_response',
    message: messages.invalid_response,
    retryable: false,
    provider,
    upstreamStatus: null,
  }
}

export class NbaAdapterError extends Error {
  constructor(readonly details: NbaApiError) {
    super(details.message)
    this.name = 'NbaAdapterError'
  }
}
