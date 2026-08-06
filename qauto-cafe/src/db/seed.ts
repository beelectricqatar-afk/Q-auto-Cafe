import { repo } from './repo'
import seedData from './seed.data.json'
import type { Department, Staff, Ingredient, Category, MenuItem, FinanceExpense } from './schema'

const SEED_FLAG = 'seeded'

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
