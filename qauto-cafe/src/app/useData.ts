import { useCallback, useEffect, useState } from 'react'
import { repo } from '../db/repo'
import { seedIfEmpty, seedPriceList } from '../db/seed'
import { syncNow, type SyncStatus } from '../sync/sync'
import { bumpSyncVersion } from '../sync/syncVersion'
import type { Department, Staff, Ingredient, Category, MenuItem, PriceListItem } from '../db/schema'

export interface Data { departments: Department[]; staff: Staff[]; ingredients: Ingredient[]; categories: Category[]; menuItems: MenuItem[]; priceList: PriceListItem[] }

async function readLocal(): Promise<Data> {
  return {
    departments: await repo.all('departments'),
    staff: await repo.all('staff'),
    ingredients: await repo.all('ingredients'),
    categories: await repo.all('categories'),
    menuItems: await repo.all('menuItems'),
    priceList: await repo.all('priceList'),
  }
}

/** How often an open screen checks for other devices' changes. */
export const LIVE_EVERY_MS = 20000

/** The last sync, plus how many in a row have failed (one is usually just a Wi-Fi blip). */
export interface LiveStatus extends SyncStatus { failStreak: number }

export function useData() {
  const [data, setData] = useState<Data | null>(null)
  // Surfaced in the header: a sync that quietly fails is how records go missing.
  const [status, setStatus] = useState<LiveStatus | null>(null)

  // Read what's on this device right now (instant, offline-safe).
  const showLocal = useCallback(async () => { setData(await readLocal()) }, [])

  const sync = useCallback(async () => {
    const s = await syncNow()
    setStatus(prev => ({ ...s, failStreak: s.failed.length ? (prev?.failStreak ?? 0) + 1 : 0 }))
    if (s.changed) bumpSyncVersion()
    return s
  }, [])

  // Push local changes + pull latest, then re-render. Used after mutations and
  // by the load / reconnect / focus triggers below.
  const refresh = useCallback(async () => {
    await sync()
    await showLocal()
  }, [sync, showLocal])

  useEffect(() => {
    (async () => {
      await seedIfEmpty()          // offline-first fallback so a brand-new device isn't blank
      await seedPriceList()        // top up the price sheet with any new rows
      await showLocal()            // show immediately
      await sync()                 // then reconcile with the cloud
      await showLocal()
    })()
  }, [sync, showLocal])

  // Re-sync when the connection returns or the user comes back to the tab.
  useEffect(() => {
    const trigger = () => { void refresh() }
    const onVisible = () => { if (!document.hidden) trigger() }
    window.addEventListener('online', trigger)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('online', trigger)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refresh])

  // Live: every few seconds, bring in what other devices changed. This also
  // retries anything that failed, so a blip clears itself. Only re-draws when
  // something actually came in, and rests while the screen is hidden.
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return
      void sync().then(s => { if (s.changed) return showLocal() })
    }, LIVE_EVERY_MS)
    return () => clearInterval(timer)
  }, [sync, showLocal])

  return { data, status, refresh }
}
