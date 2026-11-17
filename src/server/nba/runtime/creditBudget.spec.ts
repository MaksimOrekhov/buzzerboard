import { describe, expect, it } from 'vitest'
import type { WorkerEnvironment } from './types'
import { readDunkApiCreditBudget } from './creditBudget'

const now = Date.parse('2026-11-17T12:00:00.000Z')
const env: WorkerEnvironment = {
  DUNKAPI_MONTHLY_CREDIT_LIMIT: '500',
  DUNKAPI_APP_MONTHLY_CREDIT_BUDGET: '128',
  DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET: '5',
  DUNKAPI_CREDITS_USED_BASELINE: '27',
  DUNKAPI_CREDIT_BASELINE_MONTH: '2026-11',
}

describe('shared DunkAPI credit budget', () => {
  it('keeps the full regular allocation and explicit one-game box-score allocation', () => {
    expect(readDunkApiCreditBudget(env, now)).toEqual({
      month: '2026-11',
      monthlyLimit: 500,
      baselineCredits: 27,
      regularAppLimit: 128,
      boxScoreLimit: 5,
    })
  })

  it.each([
    ['lowered monthly cap', { DUNKAPI_MONTHLY_CREDIT_LIMIT: '159' }],
    [
      'box-score allocation above monthly capacity',
      { DUNKAPI_BOX_SCORE_MONTHLY_CREDIT_BUDGET: '400' },
    ],
    ['negative or malformed regular cap', { DUNKAPI_APP_MONTHLY_CREDIT_BUDGET: '128.5' }],
  ])('fails closed for %s', (_label, override) => {
    expect(readDunkApiCreditBudget({ ...env, ...override }, now)).toBeNull()
  })
})
