import type { Ingredient } from '../../db/schema'
import { Card } from '../../components/Card'
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
        <button onClick={onReceive} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 800 }}>Receive</button>
      )}
    >
      {items.length === 0 && (
        <div className="card-row" style={{ color: 'var(--muted)' }}>Nothing to buy. Tick an open request to add it here.</div>
      )}
      {items.map(item => {
        const cost = costOf(item)
        const unit = byId.get(item.ingredientId ?? '')?.unit ?? item.unit
        return (
          <div key={item.key} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{item.name}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>
                {CAFES.filter(c => item.byCafe[c]).map(c => `${CAFE_LABEL[c].replace(' Cafe', '')} ${formatQty(item.byCafe[c]!, item.unit, item.unitLabel)}`).join(' · ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontWeight: 800 }}>Buy {formatQty(item.total, item.unit, item.unitLabel)}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{cost != null ? `last ${formatUnitPrice(cost)} / ${unit}` : 'no price yet'}</div>
            </div>
          </div>
        )
      })}
      {items.length > 0 && (
        <div className="card-row" style={{ display: 'flex', justifyContent: 'space-between', gap: 12, background: '#F9FAFB' }}>
          <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Estimate at last prices{unpriced ? ` (${unpriced} without a price)` : ''}</span>
          <strong>{formatQar(Math.round(estimate * 100) / 100)}</strong>
        </div>
      )}
    </Card>
  )
}
