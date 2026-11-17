import type { WorkerEnvironment } from '@/server/nba/runtime/types'

const PROVIDER_FREE_MONTHLY_CREDITS = 500
const REGULAR_APP_MONTHLY_CREDIT_CAP = 128

export interface DunkApiCreditBudget {
  month: string
  monthlyLimit: number
  baselineCredits: number
  regularAppLimit: number
  boxScoreLimit: number
}

function parseInteger(value: string | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function readDunkApiCreditBudget(
  env: WorkerEnvironment,
  now: number,
): DunkApiCreditBudget | null {
  const month = new Date(now).toISOString().slice(0, 7)
  const monthlyLimit = parseInteger(env.DUNKAPI_MONTHLY_CREDIT_LIMIT)
  const regularAppLimit = parseInteger(env.DUNKAPI_APP_MONTHLY_CREDIT_BUDGET)
  const boxScoreLimit = parseInteger(env.DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET)
  const baselineCredits = parseInteger(env.DUNKAPI_CREDITS_USED_BASELINE)

  if (
    env.DUNKAPI_CREDIT_BASELINE_MONTH !== month ||
    monthlyLimit === null ||
    monthlyLimit < 1 ||
    monthlyLimit > PROVIDER_FREE_MONTHLY_CREDITS ||
    regularAppLimit === null ||
    regularAppLimit < 1 ||
    regularAppLimit > REGULAR_APP_MONTHLY_CREDIT_CAP ||
    boxScoreLimit === null ||
    boxScoreLimit < 0 ||
    baselineCredits === null ||
    baselineCredits < 0 ||
    baselineCredits >= monthlyLimit ||
    baselineCredits + regularAppLimit + boxScoreLimit > monthlyLimit
  )
    return null

  return { month, monthlyLimit, baselineCredits, regularAppLimit, boxScoreLimit }
}
