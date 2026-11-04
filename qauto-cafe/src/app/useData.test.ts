import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { syncNow } = vi.hoisted(() => ({ syncNow: vi.fn() }))
vi.mock('../sync/sync', () => ({ syncNow }))
vi.mock('../db/seed', () => ({ seedIfEmpty: async () => {}, seedPriceList: async () => {} }))

import { useData, LIVE_EVERY_MS } from './useData'

const ok = { at: 1, offline: false, failed: [], pending: 0, changed: false }
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)) })
// The first sync runs once the device's own data is ready.
const started = () => vi.waitFor(() => expect(syncNow).toHaveBeenCalled())
const setHidden = (hidden: boolean) => Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })

describe('live sync', () => {
  beforeEach(() => { syncNow.mockReset().mockResolvedValue(ok); setHidden(false) })
  afterEach(() => { vi.useRealTimers() })

  it('checks for other devices’ changes every few seconds while open', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    renderHook(() => useData())
    await started(); await flush()
    const first = syncNow.mock.calls.length
    await act(async () => { vi.advanceTimersByTime(LIVE_EVERY_MS) })
    await flush()
    expect(syncNow.mock.calls.length).toBe(first + 1)
  })

  it('rests while the screen is hidden', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    renderHook(() => useData())
    await started(); await flush()
    const first = syncNow.mock.calls.length
    setHidden(true)
    await act(async () => { vi.advanceTimersByTime(LIVE_EVERY_MS * 3) })
    expect(syncNow.mock.calls.length).toBe(first)
  })

  it('counts failures in a row, and starts again after a good sync', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    syncNow.mockResolvedValue({ ...ok, failed: ['orders'] })
    const { result } = renderHook(() => useData())
    await started(); await flush()
    await act(async () => { vi.advanceTimersByTime(LIVE_EVERY_MS) }); await flush()
    expect(result.current.status?.failStreak).toBe(2)
    syncNow.mockResolvedValue(ok)
    await act(async () => { vi.advanceTimersByTime(LIVE_EVERY_MS) }); await flush()
    expect(result.current.status?.failStreak).toBe(0)
  })
})
