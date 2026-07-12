import { describe, it, expect } from 'vitest'
import { computeOneOnOneRefund, ONE_ON_ONE_CANCELLATION_FEE_RATE } from './refund-one-on-one'

describe('computeOneOnOneRefund', () => {
  it('keeps a 15% fee and refunds 85%', () => {
    expect(ONE_ON_ONE_CANCELLATION_FEE_RATE).toBe(0.15)
    expect(computeOneOnOneRefund(100)).toEqual({ amount: 85, fee: 15 })
    expect(computeOneOnOneRefund(50)).toEqual({ amount: 42.5, fee: 7.5 })
  })

  it('rounds to 2 decimal places', () => {
    // 33.33 * 0.15 = 4.9995 → 5.00 fee; 33.33 - 5.00 = 28.33
    expect(computeOneOnOneRefund(33.33)).toEqual({ amount: 28.33, fee: 5 })
    // 19.99 * 0.15 = 2.9985 → 3.00 fee; 19.99 - 3.00 = 16.99
    expect(computeOneOnOneRefund(19.99)).toEqual({ amount: 16.99, fee: 3 })
  })

  it('handles zero', () => {
    expect(computeOneOnOneRefund(0)).toEqual({ amount: 0, fee: 0 })
  })

  it('amount + fee always reconstructs the paid total (to cents)', () => {
    for (const paid of [12.5, 47.7, 199.99, 1, 0.99]) {
      const { amount, fee } = computeOneOnOneRefund(paid)
      expect(Math.round((amount + fee) * 100) / 100).toBe(Math.round(paid * 100) / 100)
    }
  })
})
