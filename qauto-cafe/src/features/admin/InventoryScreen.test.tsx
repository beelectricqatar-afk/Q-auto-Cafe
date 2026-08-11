import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InventoryScreen } from './InventoryScreen'
import { repo } from '../../db/repo'
import type { Data } from '../../app/useData'
import type { Ingredient, InventoryAdjustment } from '../../db/schema'

const mint: Ingredient = {
  id: 'mint', name: 'Mint Leaves', unit: 'bundle', stockQty: 4, lowStockThreshold: 2,
  subUnit: 'leaves', subUnitPer: 40, openSubQty: 0,
}
const beans: Ingredient = { id: 'beans', name: 'Coffee Beans', unit: 'g', stockQty: 1000, lowStockThreshold: 100 }

let user: ReturnType<typeof userEvent.setup>
const refresh = vi.fn().mockResolvedValue(undefined)
const show = async (ingredients: Ingredient[]) => {
  cleanup()
  await repo.clearAll()
  for (const i of ingredients) await repo.put('ingredients', { ...i })
  render(<InventoryScreen data={{ departments: [], staff: [], categories: [], menuItems: [], ingredients } as Data} refresh={refresh} />)
}
const stock = async (id: string) => (await repo.get<Ingredient>('ingredients', id))!

beforeEach(() => { user = userEvent.setup(); refresh.mockClear() })

describe('adjusting stock', () => {
  it('adds the delta and logs it', async () => {
    await show([beans])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    await user.type(screen.getByLabelText('Adjust by, in g'), '250')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect((await stock('beans')).stockQty).toBe(1250)
    // The audit row is written after the stock row, so wait for it rather than
    // reading in the gap between the two writes.
    await waitFor(async () =>
      expect((await repo.all<InventoryAdjustment>('inventoryAdjustments'))[0]).toMatchObject({ delta: 250, reason: 'restock' }))
  })

  it('takes stock away on a negative delta', async () => {
    await show([beans])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    await user.type(screen.getByLabelText('Adjust by, in g'), '-200')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect((await stock('beans')).stockQty).toBe(800)
  })

  it('offers no conversion field for an ingredient that has no sub-unit', async () => {
    await show([beans])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.queryByLabelText(/per g/)).not.toBeInTheDocument()
  })
})

describe('setting the yield as stock arrives', () => {
  it('offers the conversion beside the amount, prefilled', async () => {
    await show([mint])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    expect(screen.getByLabelText('leaves per bundle')).toHaveValue(40)
  })

  it('records a new yield along with the delivery', async () => {
    await show([mint])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    await user.type(screen.getByLabelText('Adjust by, in bundle'), '3')
    const perBox = screen.getByLabelText('leaves per bundle')
    await user.clear(perBox)
    await user.type(perBox, '55')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await stock('mint')).toMatchObject({ stockQty: 7, subUnitPer: 55 })
  })

  it('lets the yield be corrected without moving any stock', async () => {
    await show([mint])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    const perBox = screen.getByLabelText('leaves per bundle')
    await user.clear(perBox)
    await user.type(perBox, '52')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await stock('mint')).toMatchObject({ stockQty: 4, subUnitPer: 52 })
    // No delivery happened, so nothing is written to the stock audit.
    expect(await repo.all('inventoryAdjustments')).toHaveLength(0)
  })

  it('leaves the part-used bundle alone', async () => {
    await show([{ ...mint, openSubQty: 12 }])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    await user.type(screen.getByLabelText('Adjust by, in bundle'), '2')
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await stock('mint')).toMatchObject({ stockQty: 6, openSubQty: 12 })
  })

  it('does nothing when both boxes are left alone', async () => {
    await show([mint])
    await user.click(screen.getByRole('button', { name: 'Adjust' }))
    await user.click(screen.getByRole('button', { name: 'Apply' }))
    expect(await stock('mint')).toMatchObject({ stockQty: 4, subUnitPer: 40 })
    expect(await repo.all('inventoryAdjustments')).toHaveLength(0)
  })
})
