import { repo } from './repo'
import seedData from './seed.data.json'
import { PRICE_LIST } from '../domain/priceList'
import type { Department, Staff, Ingredient, Category, MenuItem, FinanceExpense, PriceListItem } from './schema'

const SEED_FLAG = 'seeded'

/**
 * Brings the stored price sheet in line with the one shipped in the app.
 *
 * The bundle is the source of truth: prices are edited in the code, not in the
 * app, so a corrected price has to overwrite what a device already holds — an
 * add-only seed would leave every existing install on the old figure forever.
 * Rows dropped from the sheet are deleted, so a withdrawn line stops pricing
 * things. Unchanged rows are left untouched.
 *
 * The store is local and unsynced: the sheet ships in the bundle, so every
 * device ends up with the same rows without a round trip.
 */
export async function seedPriceList(): Promise<number> {
  const stored = await repo.all<PriceListItem>('priceList')
  const byId = new Map(stored.map(p => [p.id, p]))

  const changed = PRICE_LIST.filter(p => JSON.stringify(byId.get(p.id)) !== JSON.stringify(p))
  if (changed.length) await repo.putMany('priceList', changed)

  const current = new Set(PRICE_LIST.map(p => p.id))
  const withdrawn = stored.filter(p => !current.has(p.id))
  for (const p of withdrawn) await repo.remove('priceList', p.id)

  return changed.length + withdrawn.length
}

export async function seedIfEmpty(): Promise<void> {
  const flag = await repo.get('meta', SEED_FLAG)
  if (flag) return
  const d = seedData as unknown as {
    departments: Department[]; staff: Staff[]; ingredients: Ingredient[]; categories: Category[]; menuItems: MenuItem[]; financeExpenses?: FinanceExpense[]
  }
  await repo.putMany('departments', d.departments)
  await repo.putMany('staff', d.staff)
  await repo.putMany('ingredients', d.ingredients)
  await repo.putMany('categories', d.categories)
  await repo.putMany('menuItems', d.menuItems)
  await repo.putMany('financeExpenses', d.financeExpenses ?? [])
  await repo.put('meta', { key: SEED_FLAG, value: true })
}
