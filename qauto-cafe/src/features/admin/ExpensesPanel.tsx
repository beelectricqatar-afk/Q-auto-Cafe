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
import { Button } from '../../components/ui/button'
import { Input, Select, Textarea, fieldClass } from '../../components/ui/input'
import { Field } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import type { ExpenseFormState } from './useExpenseForm'

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
        <div className="grid gap-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Field label="Date" htmlFor="expense-date">
              <Input id="expense-date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} aria-label="Expense date" />
            </Field>
            <Field label="Category" htmlFor="expense-category">
              <Select id="expense-category" value={form.category} onChange={e => setForm({ ...form, category: e.target.value as FinanceExpense['category'] })} aria-label="Category">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Vendor" htmlFor="expense-vendor">
            <Input id="expense-vendor" value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor" />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Description</span>
            <TypeAhead
              value={form.description}
              onChange={description => setForm({ ...form, description })}
              names={names}
              hint={hint}
              label="Description"
              placeholder="Description"
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            <Field label="Amount" htmlFor="expense-amount">
              <Input id="expense-amount" type="number" value={form.amountQar} onChange={e => setForm({ ...form, amountQar: e.target.value })} placeholder="Amount QAR" />
            </Field>
            <Field label="Reference" htmlFor="expense-reference">
              <Input id="expense-reference" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Reference" />
            </Field>
          </div>
          <Field label="Notes" htmlFor="expense-notes">
            <Textarea id="expense-notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={3} />
          </Field>
          <Button size="lg" onClick={save}>Save expense</Button>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Import Excel</Button>
            <Button variant="outline" size="sm" onClick={exportExpenseTemplate}>Template</Button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => void importWorkbook(e.target.files?.[0])} style={{ display: 'none' }} />
          </div>
        </div>
      </Card>

      <Card hoverable title={`Expenses (${expenses.length})`} padding={0}>
        {expenses.length === 0 && <div className="card-row text-muted-foreground">No expenses recorded yet.</div>}
        {newestFirst.map(e => (
          <div key={e.id} className="card-row grid grid-cols-[100px_1fr_auto_auto] items-center gap-3">
            <span className="text-xs text-muted-foreground tabular-nums">{e.date}</span>
            <span className="min-w-0"><strong className="font-semibold">{e.description || EXPENSE_CATEGORY_LABELS[e.category]}</strong><span className="text-muted-foreground">{e.vendor ? ` · ${e.vendor}` : ''}</span></span>
            <strong className="font-semibold tabular-nums">{formatQar(e.amountQar)}</strong>
            {/* A purchase also moved stock and prices, so it is undone from
                Purchases, where all of that goes back together. */}
            {e.purchase
              ? <Badge title="Undo it under Purchases">purchase</Badge>
              : <button onClick={() => remove(e.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>}
          </div>
        ))}
      </Card>
    </>
  )
}
