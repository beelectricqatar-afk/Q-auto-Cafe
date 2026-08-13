import { useEffect, useRef, useState } from 'react'
import { repo } from '../../db/repo'
import type { FinanceExpense } from '../../db/schema'
import { Card } from '../../components/Card'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, makeExpense } from '../../domain/finance'
import { exportExpenseTemplate, importExpenseWorkbook } from '../../domain/financeExports'
import { TypeAhead } from '../../components/TypeAhead'
import { TrashIcon } from './sidebarIcons'
import type { ExpenseFormState } from './useExpenseForm'

const input = { padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 15 } as const

// Everything here is bought with petty cash, so the method is not asked for.
const PAID_IN = 'Cash'

/**
 * Recording expenses, kept beside supply requests rather than on the finance
 * screen — it is the same job, done by the same person, at the same moment.
 *
 * The list shows everything rather than one month: this page has no period
 * picker, and hiding older rows behind an invisible filter would read as data
 * loss. Finance still reads expenses for its own totals; only the entry moved.
 */
export function ExpensesPanel({ state, names = [], hint }: {
  state: ExpenseFormState
  /** Inventory names the description completes from. */
  names?: string[]
  hint?: (name: string) => string
}) {
  const { form, setForm, reset } = state
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])

  const load = async () => setExpenses(await repo.all<FinanceExpense>('financeExpenses'))

  // Reading is the external system here, so state settles in the promise's
  // callback rather than synchronously in the effect body.
  useEffect(() => {
    let live = true
    repo.all<FinanceExpense>('financeExpenses')
      .then(rows => { if (live) setExpenses(rows) })
      .catch(() => { /* local read; nothing useful to say */ })
    return () => { live = false }
  }, [])

  const save = async () => {
    const amount = Number(form.amountQar)
    if (!form.date || !Number.isFinite(amount) || amount <= 0) {
      toast('Add a valid date and amount', 'warn')
      return
    }
    await repo.put('financeExpenses', makeExpense({
      date: form.date,
      category: form.category,
      vendor: form.vendor.trim(),
      description: form.description.trim(),
      amountQar: amount,
      paymentMethod: PAID_IN,
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }))
    reset()
    await load()
    toast('Expense saved')
  }

  const remove = async (id: string) => {
    await repo.remove('financeExpenses', id)
    await load()
    toast('Expense deleted')
  }

  const importWorkbook = async (file: File | undefined) => {
    if (!file) return
    const result = await importExpenseWorkbook(file)
    for (const expense of result.expenses) await repo.put('financeExpenses', expense)
    await load()
    if (fileRef.current) fileRef.current.value = ''
    toast(
      result.errors.length
        ? `Imported ${result.expenses.length}; ${result.errors.length} row(s) skipped.`
        : `Imported ${result.expenses.length} expense(s).`,
      result.errors.length ? 'warn' : 'ok',
    )
  }

  const newestFirst = [...expenses].sort((a, b) => b.timestamp - a.timestamp)

  return (
    <>
      {/* The card clips to its corners by default, which would cut off the
          description's suggestion list. */}
      <Card hoverable title="Add expense" style={{ overflow: 'visible' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} aria-label="Expense date" style={input} />
          <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as FinanceExpense['category'] })} aria-label="Category" style={input}>
            {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
          </select>
          <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor" style={input} />
          <TypeAhead
            value={form.description}
            onChange={description => setForm({ ...form, description })}
            names={names}
            hint={hint}
            label="Description"
            placeholder="Description"
            style={{ ...input, width: '100%', boxSizing: 'border-box' }}
          />
          <input type="number" value={form.amountQar} onChange={e => setForm({ ...form, amountQar: e.target.value })} placeholder="Amount QAR" style={input} />
          <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Reference" style={input} />
          <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={3} style={{ ...input, fontFamily: 'inherit' }} />
          <button onClick={save} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}>Save expense</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => fileRef.current?.click()} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Import Excel</button>
            <button onClick={exportExpenseTemplate} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Template</button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => void importWorkbook(e.target.files?.[0])} style={{ display: 'none' }} />
          </div>
        </div>
      </Card>

      <Card hoverable title={`Expenses (${expenses.length})`} padding={0}>
        {expenses.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No expenses recorded yet.</div>}
        {newestFirst.map(e => (
          <div key={e.id} className="card-row" style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto auto', gap: 10, alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)' }}>{e.date}</span>
            <span><strong>{e.description || EXPENSE_CATEGORY_LABELS[e.category]}</strong>{e.vendor ? ` - ${e.vendor}` : ''}</span>
            <strong>{formatQar(e.amountQar)}</strong>
            <button onClick={() => remove(e.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
          </div>
        ))}
      </Card>
    </>
  )
}
