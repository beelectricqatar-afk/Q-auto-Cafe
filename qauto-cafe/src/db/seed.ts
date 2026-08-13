import { repo } from './repo'
import seedData from './seed.data.json'
import { PRICE_LIST } from '../domain/priceList'
import type { Department, Staff, Ingredient, Category, MenuItem, FinanceExpense, PriceListItem } from './schema'

const SEED_FLAG = 'seeded'

/**
 * Puts any price-sheet row that is not in the database yet.
 *
 * Runs on every load rather than only on a first seed, so a row added to the
 * sheet reaches existing installs. Rows already stored are left alone — the
 * database wins, so a price corrected in the app is not overwritten on reload.
 *
 * The store is local and unsynced: the sheet ships in the bundle, so every
 * device seeds the same rows without a round trip.
 */
export async function seedPriceList(): Promise<number> {
  const have = new Set((await repo.all<PriceListItem>('priceList')).map(p => p.id))
  const missing = PRICE_LIST.filter(p => !have.has(p.id))
  if (missing.length) await repo.putMany('priceList', missing)
  return missing.length
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
