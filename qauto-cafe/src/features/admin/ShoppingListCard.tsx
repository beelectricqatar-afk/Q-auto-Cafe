import type { Ingredient } from '../../db/schema'
import { Card } from '../../components/Card'
import { Button } from '../../components/ui/button'
import { formatQar } from '../../domain/money'
import { formatUnitPrice } from '../../domain/purchase'
import { CAFES, CAFE_LABEL, formatQty, type ShoppingItem } from '../../domain/shoppingList'

/**
 * Everything the ticked requests still need, one row per item, with how much
 * each cafe asked for — so one trip buys for both.
 */
export function ShoppingListCard({ items, ingredients, onReceive }: { items: ShoppingItem[]; ingredients: Ingredient[]; onReceive: () => void }) {
  const byId = new Map(ingredients.map(i => [i.id, i]))
  const costOf = (item: ShoppingItem) => (item.ingredientId ? byId.get(item.ingredientId)?.unitCostQar : undefined)
  const estimate = items.reduce((sum, item) => sum + (costOf(item) ?? 0) * item.total, 0)
  const unpriced = items.filter(item => costOf(item) == null).length

  return (
    <Card
      hoverable
      title={`Shopping list${items.length ? ` (${items.length})` : ''}`}
      padding={0}
      actions={items.length > 0 && (
        <Button size="sm" onClick={onReceive}>Receive</Button>
      )}
    >
      {items.length === 0 && (
        <div className="card-row text-muted-foreground">Nothing to buy. Tick an open request to add it here.</div>
      )}
      {items.map(item => {
        const cost = costOf(item)
        const unit = byId.get(item.ingredientId ?? '')?.unit ?? item.unit
        return (
          <div key={item.key} className="card-row flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{item.name}</div>
              <div className="text-xs text-muted-foreground">
                {CAFES.filter(c => item.byCafe[c]).map(c => `${CAFE_LABEL[c].replace(' Cafe', '')} ${formatQty(item.byCafe[c]!, item.unit, item.unitLabel)}`).join(' · ')}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-semibold tabular-nums">Buy {formatQty(item.total, item.unit, item.unitLabel)}</div>
              <div className="text-xs text-muted-foreground tabular-nums">{cost != null ? `last ${formatUnitPrice(cost)} / ${unit}` : 'no price yet'}</div>
            </div>
          </div>
        )
      })}
      {items.length > 0 && (
        <div className="card-row flex justify-between gap-3 bg-[#FAFAFA]">
          <span className="text-muted-foreground">Estimate at last prices{unpriced ? ` (${unpriced} without a price)` : ''}</span>
          <strong className="font-semibold tabular-nums">{formatQar(Math.round(estimate * 100) / 100)}</strong>
        </div>
      )}
    </Card>
  )
}
