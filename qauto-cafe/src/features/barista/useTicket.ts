import { useMemo, useState } from 'react'
import type { MenuItem, OrderLine, RecipeLine } from '../../db/schema'
import { ticketTotal } from '../../domain/money'
import { sameRecipe, tidyRecipe } from '../../domain/deduction'

// Lines carry their own key because the same menu item can appear twice with
// different recipes — one customer wants extra milk, the next doesn't — so the
// item id alone no longer identifies a line.
export interface TicketLine extends OrderLine { key: string }

export function useTicket() {
  const [lines, setLines] = useState<TicketLine[]>([])

  /**
   * Adds one of `item`. `recipe` is a per-order tailoring; passing the menu
   * item's own recipe (or nothing) leaves the line following the menu, so a
   * later price or recipe edit still applies to it.
   */
  const add = (item: MenuItem, recipe?: RecipeLine[]) => setLines(ls => {
    const tailored = recipe && !sameRecipe(recipe, item.recipe) ? tidyRecipe(recipe) : undefined
    // Only fold into an existing line when it is the same item made the same way.
    const i = ls.findIndex(l => l.itemId === item.id && sameRecipe(l.recipe ?? item.recipe, tailored ?? item.recipe))
    if (i >= 0) {
      const copy = [...ls]
      copy[i] = { ...copy[i], qty: copy[i].qty + 1 }
      return copy
    }
    return [...ls, { key: crypto.randomUUID(), itemId: item.id, name: item.name, qty: 1, unitPrice: item.price, recipe: tailored }]
  })

  const setQty = (key: string, qty: number) =>
    setLines(ls => qty <= 0 ? ls.filter(l => l.key !== key) : ls.map(l => l.key === key ? { ...l, qty } : l))

  /** Retailors a line already on the ticket. */
  const setRecipe = (key: string, recipe: RecipeLine[], item: MenuItem) =>
    setLines(ls => ls.map(l => l.key === key
      ? { ...l, recipe: sameRecipe(recipe, item.recipe) ? undefined : tidyRecipe(recipe) }
      : l))

  const clear = () => setLines([])
  const total = useMemo(() => ticketTotal(lines), [lines])
  /** The lines as they should be stored — without the UI-only key. */
  const orderLines = useMemo((): OrderLine[] => lines.map(l => ({
    itemId: l.itemId,
    name: l.name,
    qty: l.qty,
    unitPrice: l.unitPrice,
    // An emptied recipe is a real choice, so `[]` is kept while absent stays absent.
    ...(l.recipe !== undefined && { recipe: l.recipe }),
  })), [lines])

  return { lines, orderLines, add, setQty, setRecipe, clear, total }
}
