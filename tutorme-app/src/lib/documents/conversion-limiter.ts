/**
 * Process-wide gate for LibreOffice (soffice) conversions.
 *
 * Each conversion spawns a memory-heavy soffice process; running several at once
 * can OOM a small Cloud Run instance and take it down. This serialises them so a
 * burst degrades to "slower", not "crashed". A bounded wait queue means a large
 * pile-up is rejected (caller falls back to text) rather than growing unbounded.
 *
 * All conversion paths (the on-demand diagram endpoint and the upload route)
 * share this single limiter because they share the process's memory.
 */

const MAX_CONCURRENT = 1
const MAX_QUEUED = 16

let active = 0
const waiters: Array<() => void> = []

export class ConversionBusyError extends Error {
  constructor() {
    super('Document conversion is busy; too many concurrent requests')
    this.name = 'ConversionBusyError'
  }
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++
    return Promise.resolve()
  }
  if (waiters.length >= MAX_QUEUED) {
    return Promise.reject(new ConversionBusyError())
  }
  return new Promise<void>(resolve => waiters.push(resolve))
}

function release(): void {
  const next = waiters.shift()
  if (next) {
    // Hand the slot straight to the next waiter (active stays the same).
    next()
  } else {
    active = Math.max(0, active - 1)
  }
}

/**
 * Run `fn` while holding a conversion slot. Waits (up to the queue bound) if
 * another conversion is in flight; throws ConversionBusyError if the queue is
 * full. The slot is always released, even if `fn` throws.
 */
export async function withConversionSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}

/** Test-only view of the limiter's internal counters. */
export function _conversionLimiterState(): { active: number; queued: number } {
  return { active, queued: waiters.length }
}
