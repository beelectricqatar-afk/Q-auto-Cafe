import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTicket } from './useTicket'
import type { MenuItem } from '../../db/schema'

const latte: MenuItem = {
  id: 'latte', name: 'Latte', categoryId: 'h', price: 12, active: true,
  recipe: [{ ingredientId: 'milk', qty: 250 }, { ingredientId: 'beans', qty: 18 }],
}
const extraMilk = [{ ingredientId: 'milk', qty: 400 }, { ingredientId: 'beans', qty: 18 }]

describe('useTicket', () => {
  it('adds, increments duplicate, and computes total', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.add(latte))
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].qty).toBe(2)
    expect(result.current.total).toBe(24)
  })

  it('removes a line and clears', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.setQty(result.current.lines[0].key, 0))
    expect(result.current.lines).toHaveLength(0)
  })

  it('keeps a tailored line separate from the standard one', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.add(latte, extraMilk))
    expect(result.current.lines).toHaveLength(2)
    expect(result.current.lines[0].recipe).toBeUndefined()
    expect(result.current.lines[1].recipe).toEqual(extraMilk)
    expect(result.current.total).toBe(24)
  })

  it('folds together two lines tailored the same way', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte, extraMilk))
    act(() => result.current.add(latte, extraMilk))
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].qty).toBe(2)
  })

  it('treats an unchanged recipe as no tailoring at all', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.add(latte, [latte.recipe[1], latte.recipe[0]])) // same lines, reordered
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].recipe).toBeUndefined() // still follows the menu
  })

  it('strips blank rows left by the editor', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte, [...extraMilk, { ingredientId: '', qty: 0 }]))
    expect(result.current.lines[0].recipe).toEqual(extraMilk)
  })

  it('records an emptied recipe as a real change, not as absent', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte, []))
    expect(result.current.lines[0].recipe).toEqual([])
  })

  it('exposes order lines without the UI-only key', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte, extraMilk))
    expect(result.current.orderLines[0]).not.toHaveProperty('key')
    expect(result.current.orderLines[0]).toMatchObject({ itemId: 'latte', qty: 1, unitPrice: 12, recipe: extraMilk })
  })

  it('changes quantity on only the targeted line', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.add(latte, extraMilk))
    act(() => result.current.setQty(result.current.lines[1].key, 5))
    expect(result.current.lines.map(l => l.qty)).toEqual([1, 5])
  })
})
