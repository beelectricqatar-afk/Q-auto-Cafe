import { useEffect, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { FinanceExpense } from '../../db/schema'
import { Card } from '../../components/Card'
import { Button } from '../../components/ui/button'
import { useConfirm } from '../../components/ui/confirm-dialog'
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
  const { confirm, dialog } = useConfirm()
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let live = true
    repo.all<FinanceExpense>('financeExpenses')
      .then(rows => { if (live) setPurchases(rows.filter(e => e.purchase).sort((a, b) => b.timestamp - a.timestamp || b.createdAt - a.createdAt)) })
      .catch(() => {})
    return () => { live = false }
  }, [version])

  const undo = async (expense: FinanceExpense) => {
    if (!await confirm({
      title: 'Undo this purchase?',
      description: `${expense.vendor}${expense.reference ? ` · ${expense.reference}` : ''} · ${formatQar(expense.amountQar)}. The stock comes back out, prices go back, and the expense is removed.`,
      confirmLabel: 'Undo purchase',
      cancelLabel: 'Keep',
    })) return
    const { ingredients, adjustments } = undoPurchase(expense, data.ingredients)
    for (const ing of ingredients) await repo.put('ingredients', ing)
    for (const adj of adjustments) await repo.put('inventoryAdjustments', adj)
    if (expense.purchase?.receiptFileId) await repo.remove('financeReceipts', expense.purchase.receiptFileId)
    await repo.remove('financeExpenses', expense.id)
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
      actions={<Button size="sm" onClick={onAdd}>+ Add purchase</Button>}
    >
      {purchases.length === 0 && (
        <div className="card-row text-muted-foreground">
          Bought something? Tap <strong className="font-semibold text-foreground">+ Add purchase</strong> and enter it from the receipt. Stock, prices and the expense update in one step.
        </div>
      )}
      {purchases.slice(0, SHOWN).map(p => (
        <div key={p.id} className="card-row grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-semibold">{p.vendor}{p.reference ? ` · ${p.reference}` : ''}</div>
              <div className="text-xs text-muted-foreground">{p.date} · {p.description} · {p.paymentMethod}</div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <strong className="font-semibold tabular-nums">{formatQar(p.amountQar)}</strong>
              <button onClick={() => void undo(p)} className="icon-btn danger" aria-label={`Undo purchase ${p.reference ?? ''} from ${p.vendor}`} title="Undo this purchase"><TrashIcon /></button>
            </div>
          </div>
        </div>
      ))}
      {dialog}
    </Card>
  )
}
