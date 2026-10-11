import { describe, it, expect } from 'vitest'
import { computeOneOnOneRefund } from './refund-one-on-one'

describe('computeOneOnOneRefund', () => {
  it('refunds the full amount by default (no fee)', () => {
    expect(computeOneOnOneRefund(100)).toEqual({ amount: 100, fee: 0 })
    expect(computeOneOnOneRefund(50)).toEqual({ amount: 50, fee: 0 })
  })

  it('prorates by the refundable fraction (undelivered ÷ total sessions)', () => {
    // 10-session series, 2 delivered → refund 8/10.
    expect(computeOneOnOneRefund(100, 0.8)).toEqual({ amount: 80, fee: 20 })
    // 4-session series, 1 delivered → refund 3/4.
    expect(computeOneOnOneRefund(50, 0.75)).toEqual({ amount: 37.5, fee: 12.5 })
  })

  it('rounds to 2 decimal places', () => {
    // 33.33 * 0.85 = 28.3305 → 28.33
    expect(computeOneOnOneRefund(33.33, 0.85)).toEqual({ amount: 28.33, fee: 5 })
    // 19.99 * 0.85 = 16.9915 → 16.99
    expect(computeOneOnOneRefund(19.99, 0.85)).toEqual({ amount: 16.99, fee: 3 })
  })

  it('clamps the fraction to 0–1', () => {
    expect(computeOneOnOneRefund(100, 1.5)).toEqual({ amount: 100, fee: 0 })
    expect(computeOneOnOneRefund(100, -0.5)).toEqual({ amount: 0, fee: 100 })
  })

  it('handles zero', () => {
    expect(computeOneOnOneRefund(0)).toEqual({ amount: 0, fee: 0 })
    expect(computeOneOnOneRefund(0, 0.5)).toEqual({ amount: 0, fee: 0 })
  })

  it('amount + fee always reconstructs the paid total (to cents)', () => {
    for (const paid of [12.5, 47.7, 199.99, 1, 0.99]) {
      for (const fraction of [1, 0.8, 0.5, 0.15, 0]) {
        const { amount, fee } = computeOneOnOneRefund(paid, fraction)
        expect(Math.round((amount + fee) * 100) / 100).toBe(Math.round(paid * 100) / 100)
      }
    }
  })
})
