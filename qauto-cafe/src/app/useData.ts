import { useCallback, useEffect, useState } from 'react'
import { repo } from '../db/repo'
import { seedIfEmpty, seedPriceList } from '../db/seed'
import { syncNow, type SyncStatus } from '../sync/sync'
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

export function useData() {
  const [data, setData] = useState<Data | null>(null)
  // Surfaced in the header: a sync that quietly fails is how records go missing.
  const [status, setStatus] = useState<SyncStatus | null>(null)

  // Read what's on this device right now (instant, offline-safe).
  const showLocal = useCallback(async () => { setData(await readLocal()) }, [])

  // Push local changes + pull latest, then re-render. Used after mutations and
  // by the load / reconnect / focus triggers below.
  const refresh = useCallback(async () => {
    setStatus(await syncNow())
    await showLocal()
  }, [showLocal])

  useEffect(() => {
    (async () => {
      await seedIfEmpty()          // offline-first fallback so a brand-new device isn't blank
      await seedPriceList()        // top up the price sheet with any new rows
      await showLocal()            // show immediately
      setStatus(await syncNow())   // then reconcile with the cloud
      await showLocal()
    })()
  }, [showLocal])

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

  return { data, status, refresh }
}
