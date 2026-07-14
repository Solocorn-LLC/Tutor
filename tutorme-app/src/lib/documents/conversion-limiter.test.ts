import { describe, it, expect } from 'vitest'
import {
  withConversionSlot,
  ConversionBusyError,
  _conversionLimiterState,
} from './conversion-limiter'

// A deferred promise whose resolution we control, to hold a slot open.
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => (resolve = r))
  return { promise, resolve }
}

describe('withConversionSlot', () => {
  it('runs a single task immediately and releases the slot', async () => {
    const result = await withConversionSlot(async () => 42)
    expect(result).toBe(42)
    expect(_conversionLimiterState()).toEqual({ active: 0, queued: 0 })
  })

  it('serialises concurrent tasks (only one active at a time)', async () => {
    const order: string[] = []
    const a = deferred()

    // Task A grabs the only slot and holds it until we resolve `a`.
    const pA = withConversionSlot(async () => {
      order.push('A:start')
      await a.promise
      order.push('A:end')
      return 'A'
    })

    // Give A a tick to acquire the slot.
    await Promise.resolve()

    // Task B must WAIT — it can't start until A releases.
    const pB = withConversionSlot(async () => {
      order.push('B:start')
      return 'B'
    })
    await Promise.resolve()
    expect(order).toEqual(['A:start']) // B has not started

    a.resolve()
    const [rA, rB] = await Promise.all([pA, pB])
    expect(rA).toBe('A')
    expect(rB).toBe('B')
    expect(order).toEqual(['A:start', 'A:end', 'B:start'])
    expect(_conversionLimiterState()).toEqual({ active: 0, queued: 0 })
  })

  it('always releases the slot even when the task throws', async () => {
    await expect(
      withConversionSlot(async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(_conversionLimiterState()).toEqual({ active: 0, queued: 0 })

    // The limiter is not wedged — a subsequent task still runs.
    await expect(withConversionSlot(async () => 'ok')).resolves.toBe('ok')
  })

  it('rejects with ConversionBusyError once the wait queue is full', async () => {
    const hold = deferred()
    // One task holds the single slot.
    const holder = withConversionSlot(async () => {
      await hold.promise
    })
    await Promise.resolve()

    // Fill the queue (MAX_QUEUED = 16) — these wait, they don't reject.
    const queued = Array.from({ length: 16 }, () =>
      withConversionSlot(async () => 'queued').catch(e => e)
    )
    await Promise.resolve()

    // The 17th waiter overflows the queue → rejected immediately.
    await expect(withConversionSlot(async () => 'overflow')).rejects.toBeInstanceOf(
      ConversionBusyError
    )

    // Drain everything cleanly.
    hold.resolve()
    await holder
    await Promise.all(queued)
    expect(_conversionLimiterState()).toEqual({ active: 0, queued: 0 })
  })
})
