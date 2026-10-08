import { useEffect, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { FinanceExpense } from '../../db/schema'
import { Card } from '../../components/Card'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { undoPurchase } from '../../domain/purchase'
import { TrashIcon } from './sidebarIcons'

const SHOWN = 8

/**
 * The way into recording a purchase, and the latest few recorded.
 *
 * Undo lives here rather than on the expense list, because deleting only the
 * expense would leave the stock and the new price behind.
 */
export function PurchasesCard({ data, refresh, onAdd, onChanged }: {
  data: Data
  refresh: () => Promise<void>
  onAdd: () => void
  /** Called after an undo, so the expense list beside it can reload. */
  onChanged?: () => void
}) {
  const toast = useToast()
  const [purchases, setPurchases] = useState<FinanceExpense[]>([])
  const [confirming, setConfirming] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    repo.all<FinanceExpense>('financeExpenses')
      .then(rows => { if (live) setPurchases(rows.filter(e => e.purchase).sort((a, b) => b.timestamp - a.timestamp || b.createdAt - a.createdAt)) })
      .catch(() => {})
    return () => { live = false }
  }, [version])

  const undo = async (expense: FinanceExpense) => {
    const { ingredients, adjustments } = undoPurchase(expense, data.ingredients)
    for (const ing of ingredients) await repo.put('ingredients', ing)
    for (const adj of adjustments) await repo.put('inventoryAdjustments', adj)
    if (expense.purchase?.receiptFileId) await repo.remove('financeReceipts', expense.purchase.receiptFileId)
    await repo.remove('financeExpenses', expense.id)
    setConfirming(null)
    setVersion(v => v + 1)
    onChanged?.()
    toast('Purchase undone: stock, prices and the expense are back as they were')
    void refresh()
  }

  return (
    <Card
      hoverable
      title="Purchases"
      padding={0}
      actions={<button onClick={onAdd} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontWeight: 800 }}>+ Add purchase</button>}
    >
      {purchases.length === 0 && (
        <div className="card-row" style={{ color: 'var(--muted)' }}>
          Bought something? Tap <strong>+ Add purchase</strong> and enter it from the receipt. Stock, prices and the expense update in one step.
        </div>
      )}
      {purchases.slice(0, SHOWN).map(p => (
        <div key={p.id} className="card-row" style={{ display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700 }}>{p.vendor}{p.reference ? ` · ${p.reference}` : ''}</div>
              <div style={{ color: 'var(--muted)', fontSize: 13 }}>{p.date} · {p.description} · {p.paymentMethod}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              <strong>{formatQar(p.amountQar)}</strong>
              <button onClick={() => setConfirming(p.id)} className="icon-btn danger" aria-label={`Undo purchase ${p.reference ?? ''} from ${p.vendor}`} title="Undo this purchase"><TrashIcon /></button>
            </div>
          </div>
          {confirming === p.id && (
            <div role="alertdialog" aria-label="Undo this purchase" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', background: '#fef3f2', borderRadius: 10, padding: 10 }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Undo this purchase? The stock comes back out, prices go back, and the expense is removed.</span>
              <button onClick={() => void undo(p)} style={{ border: 'none', background: 'var(--danger)', color: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Undo purchase</button>
              <button onClick={() => setConfirming(null)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Keep</button>
            </div>
          )}
        </div>
      ))}
    </Card>
  )
}
