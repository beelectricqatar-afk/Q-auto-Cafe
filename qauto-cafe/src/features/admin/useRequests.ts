import { useCallback, useEffect, useState } from 'react'
import type { Request } from '../../db/schema'
import { client } from '../../sync/client'
import { isConfigured } from '../../sync/config'

export interface RequestsState {
  requests: Request[]
  /** Count of requests still outstanding — what the sidebar badge shows. */
  open: number
  loading: boolean
  /** The last load failed, so the list may be stale or empty. */
  failed: boolean
  reload: () => Promise<void>
}

const fetchRequests = (): Promise<Request[]> =>
  isConfigured() ? client.listRequests() : Promise.resolve([])

const newestFirst = (rows: Request[]) => [...rows].sort((a, b) => b.timestamp - a.timestamp)

/**
 * Requests live directly in the shared cloud, not in IndexedDB, so they are
 * fetched rather than read locally. Held once at the admin shell so the sidebar
 * badge and the Requests screen always show the same thing — marking one done
 * updates both.
 */
export function useRequests(): RequestsState {
  const [requests, setRequests] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  /** Manual refresh, and after any write. */
  const reload = useCallback(async () => {
    try {
      setRequests(newestFirst(await fetchRequests()))
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  // The fetch is the external system here, so state lands in its callbacks
  // rather than in the effect body — and is dropped if the panel closes before
  // the response arrives.
  useEffect(() => {
    let live = true
    fetchRequests()
      .then(rows => { if (live) { setRequests(newestFirst(rows)); setFailed(false) } })
      .catch(() => { if (live) setFailed(true) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [])

  return { requests, open: requests.filter(r => !r.done).length, loading, failed, reload }
}
