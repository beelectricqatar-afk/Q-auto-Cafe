import type { Ingredient } from '../../db/schema'
import type { TicketLine } from './useTicket'
import { formatQar, applyDiscount } from '../../domain/money'
import { Stepper } from '../../components/Stepper'

const DISCOUNT_PCT = 15

export function Ticket({ lines, total, onQty, milkOf, lactoseFreeId, onChangeMilk, onClear, onPlace, canPlace, discount, onToggleDiscount }: {
  lines: TicketLine[]; total: number; onQty: (key: string, q: number) => void
  /** The milk a line is made with, or null when it isn't a milk drink. */
  milkOf: (line: TicketLine) => Ingredient | null
  lactoseFreeId?: string
  onChangeMilk: (line: TicketLine) => void
  onClear: () => void; onPlace: () => void; canPlace: boolean
  discount: boolean; onToggleDiscount: () => void
}) {
  const finalTotal = discount ? applyDiscount(total, DISCOUNT_PCT) : total
  return (
    <div role="region" aria-label="Ticket" style={{ background: '#1A1A1A', color: '#fff', borderRadius: 'var(--radius)', padding: 14, display: 'grid', gridTemplateRows: '1fr auto', height: '100%', minHeight: 0 }}>
      <div style={{ overflow: 'auto', minHeight: 0 }}>
        {lines.length === 0 && <div style={{ color: 'rgba(255,255,255,0.5)', padding: 12 }}>No items yet</div>}
        {lines.map(l => {
          const milk = milkOf(l)
          return (
          <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
            <div style={{ fontWeight: 600 }}>
              {l.name}
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{l.unitPrice === 0 ? 'Free' : formatQar(l.unitPrice)}</span>
                {/* Only the non-standard milk is called out — badging every latte
                    "fresh milk" would be noise on a busy ticket. */}
                {milk && milk.id === lactoseFreeId && (
                  <span style={{ background: '#fff', color: '#1A1A1A', borderRadius: 6, padding: '1px 6px', fontSize: 11, fontWeight: 800 }}>LACTOSE FREE</span>
                )}
                {milk && (
                  <button
                    onClick={() => onChangeMilk(l)}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.65)', textDecoration: 'underline', padding: 0, fontSize: 13, cursor: 'pointer' }}
                  >
                    Change milk
                  </button>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Stepper value={l.qty} onChange={q => onQty(l.key, q)} />
              <strong style={{ minWidth: 80, textAlign: 'right' }}>{l.unitPrice === 0 ? 'Free' : formatQar(l.unitPrice * l.qty)}</strong>
            </div>
          </div>
          )
        })}
      </div>
      <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
        {discount && (
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.5)' }}>
            <span>Subtotal · 15% off</span><span style={{ textDecoration: 'line-through' }}>{formatQar(total)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 800 }}><span>Total</span><span>{formatQar(finalTotal)}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClear} style={{ flex: 1, padding: 14, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: '#2A2A2A', color: '#fff', fontWeight: 700 }}>Clear</button>
          <button
            onClick={onToggleDiscount}
            style={{ flex: 1, padding: 14, borderRadius: 10, fontWeight: 800,
              border: discount ? 'none' : '1px solid rgba(255,255,255,0.2)',
              background: discount ? '#fff' : '#2A2A2A', color: discount ? '#1A1A1A' : '#fff' }}
          >
            15% Off
          </button>
          <button onClick={onPlace} disabled={!canPlace} style={{ flex: 2, padding: 14, borderRadius: 10, border: 'none', background: canPlace ? '#fff' : '#3A3A3A', color: canPlace ? '#1A1A1A' : 'rgba(255,255,255,0.5)', fontWeight: 800, fontSize: 18 }}>Place Order</button>
        </div>
      </div>
    </div>
  )
}
