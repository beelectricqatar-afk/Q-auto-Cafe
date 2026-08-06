import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { DeletionLog, FinanceExpense, FinanceReceipt, FinanceWastage, Order } from '../../db/schema'
import { useToast } from '../../components/Toast'
import { exportXlsx } from '../../domain/xlsx'
import { formatQar } from '../../domain/money'
import { buildFinanceSummary, currentMonthKey, dayRange, EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS, makeExpense, makeWastage, monthRange, todayKey } from '../../domain/finance'
import { exportBusinessSummaryPdf, exportDetailedSales, exportExpenses, exportExpenseTemplate, importExpenseWorkbook } from '../../domain/financeExports'
import { Card } from '../../components/Card'
import { MetricCard } from '../../components/MetricCard'
import { DollarIcon, PercentIcon, InventoryIcon, TrashIcon, WalletIcon, TrendUpIcon } from './sidebarIcons'

const input = { padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 15 } as const
interface ExpenseForm {
  date: string
  category: FinanceExpense['category']
  vendor: string
  description: string
  amountQar: string
  paymentMethod: string
  reference: string
  notes: string
}
interface WastageForm {
  date: string
  itemName: string
  qty: string
  unit: string
  amountQar: string
  reason: string
  notes: string
}

const expenseDefaults = (): ExpenseForm => ({
  date: new Date().toISOString().slice(0, 10),
  category: 'supplies' as FinanceExpense['category'],
  vendor: '',
  description: '',
  amountQar: '',
  paymentMethod: 'Cash',
  reference: '',
  notes: '',
})

const wastageDefaults = (): WastageForm => ({
  date: new Date().toISOString().slice(0, 10),
  itemName: '',
  qty: '',
  unit: 'pcs',
  amountQar: '',
  reason: '',
  notes: '',
})

export function FinanceScreen({ data }: { data: Data }) {
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement | null>(null)
  const receiptRef = useRef<HTMLInputElement | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([])
  const [wastages, setWastages] = useState<FinanceWastage[]>([])
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([])
  // Report either a whole month or an explicit run of days.
  const [rangeMode, setRangeMode] = useState<'month' | 'days'>('month')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [fromDay, setFromDay] = useState(todayKey())
  const [toDay, setToDay] = useState(todayKey())
  const [form, setForm] = useState(expenseDefaults)
  const [wastageForm, setWastageForm] = useState(wastageDefaults)

  const load = useCallback(async () => {
    const [ordersRows, expenseRows, receiptRows, wastageRows, deletedRows] = await Promise.all([
      repo.all<Order>('orders'),
      repo.all<FinanceExpense>('financeExpenses'),
      repo.all<FinanceReceipt>('financeReceipts'),
      repo.all<FinanceWastage>('financeWastages'),
      repo.all<DeletionLog>('deletionLogs'),
    ])
    setOrders(ordersRows)
    setExpenses(expenseRows)
    setReceipts(receiptRows)
    setWastages(wastageRows)
    setDeletionLogs(deletedRows)
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(id)
  }, [load])

  const range = useMemo(
    () => rangeMode === 'month' ? monthRange(monthKey) : dayRange(fromDay, toDay),
    [rangeMode, monthKey, fromDay, toDay],
  )

  const summary = useMemo(() => buildFinanceSummary({
    range,
    orders,
    expenses,
    wastages,
    deletionLogs,
    departments: data.departments,
    staff: data.staff,
    categories: data.categories,
    menuItems: data.menuItems,
    ingredients: data.ingredients,
  }), [range, orders, expenses, wastages, deletionLogs, data])

  const saveExpense = async () => {
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
      paymentMethod: form.paymentMethod.trim() || 'Cash',
      reference: form.reference.trim() || undefined,
      notes: form.notes.trim() || undefined,
    }))
    setForm(expenseDefaults())
    await load()
    toast('Expense saved')
  }

  const removeExpense = async (id: string) => {
    await repo.remove('financeExpenses', id)
    await load()
    toast('Expense deleted')
  }

  const saveWastage = async () => {
    const qty = wastageForm.qty.trim() ? Number(wastageForm.qty) : undefined
    const amount = wastageForm.amountQar.trim() ? Number(wastageForm.amountQar) : undefined
    if (!wastageForm.date || !wastageForm.itemName.trim()) {
      toast('Add a date and item name', 'warn')
      return
    }
    if (qty != null && (!Number.isFinite(qty) || qty <= 0)) {
      toast('Quantity must be greater than zero', 'warn')
      return
    }
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
      toast('Wastage amount must be greater than zero', 'warn')
      return
    }
    await repo.put('financeWastages', makeWastage({
      date: wastageForm.date,
      itemName: wastageForm.itemName.trim(),
      qty,
      unit: wastageForm.unit.trim() || undefined,
      amountQar: amount,
      reason: wastageForm.reason.trim() || undefined,
      notes: wastageForm.notes.trim() || undefined,
    }))
    setWastageForm(wastageDefaults())
    await load()
    toast('Wastage logged')
  }

  const removeWastage = async (id: string) => {
    await repo.remove('financeWastages', id)
    await load()
    toast('Wastage deleted')
  }

  const importExpenses = async (file: File | undefined) => {
    if (!file) return
    const result = await importExpenseWorkbook(file)
    for (const expense of result.expenses) await repo.put('financeExpenses', expense)
    await load()
    if (fileRef.current) fileRef.current.value = ''
    const note = result.errors.length ? ` Imported ${result.expenses.length}; ${result.errors.length} row(s) skipped.` : `Imported ${result.expenses.length} expense(s).`
    toast(note, result.errors.length ? 'warn' : 'ok')
  }

  const storeReceiptFiles = async (files: FileList | null) => {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
      })
      const receipt: FinanceReceipt = {
        id: crypto.randomUUID(),
        uploadedAt: Date.now(),
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl,
      }
      await repo.put('financeReceipts', receipt)
    }
    if (receiptRef.current) receiptRef.current.value = ''
    await load()
    toast(`Stored ${files.length} receipt file(s)`)
  }

  const removeReceipt = async (id: string) => {
    await repo.remove('financeReceipts', id)
    await load()
    toast('Receipt removed')
  }

  const exportBillingStatement = () => {
    const rows = summary.orders.slice().sort((a, b) => a.timestamp - b.timestamp).map(o => ({
      date: new Date(o.timestamp).toLocaleString(),
      items: o.lines.map(l => `${l.qty}x ${l.name}`).join(', ') + (o.discountPct ? ` - ${o.discountPct}% off` : ''),
      total: o.total,
    }))
    return exportXlsx(`billing-${range.key}.xlsx`, 'Statement', [
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Items', key: 'items', width: 60 },
      { header: 'Total (QAR)', key: 'total', width: 14, money: true },
    ], rows, { totals: { date: `${range.label} total`, items: '', total: summary.netSales } })
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h2 style={{ margin: 0 }}>Finance</h2>
          <div style={{ color: 'var(--muted)', fontWeight: 700 }}>{summary.range.label}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            {(['month', 'days'] as const).map(m => (
              <button
                key={m}
                onClick={() => setRangeMode(m)}
                style={{ border: 'none', padding: '9px 14px', fontWeight: 700, cursor: 'pointer',
                  background: rangeMode === m ? '#1A1A1A' : '#fff', color: rangeMode === m ? '#fff' : 'var(--ink)' }}
              >
                {m === 'month' ? 'Month' : 'Days'}
              </button>
            ))}
          </div>
          {rangeMode === 'month'
            ? <input type="month" value={monthKey} onChange={e => setMonthKey(e.target.value)} style={input} />
            : (
              <>
                <input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} style={input} aria-label="From date" />
                <span style={{ color: 'var(--muted)' }}>to</span>
                <input type="date" value={toDay} onChange={e => setToDay(e.target.value)} style={input} aria-label="To date" />
              </>
            )}
          <button onClick={exportBillingStatement} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700 }}>Billing Excel</button>
          <button onClick={() => exportDetailedSales(summary.orders, data, range.key)} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700 }}>Sales Excel</button>
          <button onClick={() => exportExpenses(summary.expenses, range.key)} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '9px 12px', fontWeight: 700 }}>Expenses Excel</button>
          <button onClick={() => exportBusinessSummaryPdf(summary)} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 800 }}>Summary PDF</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <MetricCard valueSize={22} icon={DollarIcon} label="Gross sales" value={formatQar(summary.grossSales)} />
        <MetricCard valueSize={22} icon={PercentIcon} label="Discounts" value={formatQar(summary.discounts)} tone={summary.discounts > 0 ? 'bad' : 'normal'} />
        <MetricCard valueSize={22} icon={TrashIcon} label="Wastage" value={formatQar(summary.wastageTotal)} tone={summary.wastageTotal > 0 ? 'bad' : 'normal'} />
        <MetricCard valueSize={22} icon={WalletIcon} label="Expenses" value={formatQar(summary.expenseTotal)} />
        <MetricCard valueSize={22} icon={DollarIcon} label="Net sales" value={formatQar(summary.netSales)} tone="good" />
        <MetricCard valueSize={22} icon={InventoryIcon} label="COGS" value={formatQar(summary.cogs)} />
        <MetricCard valueSize={22} icon={TrendUpIcon} label="Gross profit" value={formatQar(summary.grossProfit)} tone={summary.grossProfit >= 0 ? 'good' : 'bad'} />
        <MetricCard valueSize={22} icon={TrendUpIcon} label="Net profit" value={formatQar(summary.netProfit)} tone={summary.netProfit >= 0 ? 'good' : 'bad'} />
      </div>

      {summary.missingCostItems.length > 0 && (
        <div style={{ background: '#fff8e6', border: '1px solid #f0c36a', borderRadius: 16, padding: 24 }}>
          <strong>COGS needs unit costs:</strong> {summary.missingCostItems.slice(0, 12).join(', ')}
          {summary.missingCostItems.length > 12 ? ` and ${summary.missingCostItems.length - 12} more` : ''}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        <Card hoverable title="Add expense">
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} style={input} />
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as ExpenseForm['category'] })} style={input}>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{EXPENSE_CATEGORY_LABELS[c]}</option>)}
            </select>
            <input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} placeholder="Vendor" style={input} />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Description" style={input} />
            <input type="number" value={form.amountQar} onChange={e => setForm({ ...form, amountQar: e.target.value })} placeholder="Amount QAR" style={input} />
            <input value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} placeholder="Payment method" style={input} />
            <input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="Reference" style={input} />
            <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notes" rows={3} style={{ ...input, fontFamily: 'inherit' }} />
            <button onClick={saveExpense} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}>Save expense</button>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => fileRef.current?.click()} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Import Excel</button>
              <button onClick={exportExpenseTemplate} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 12px', fontWeight: 700 }}>Template</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={e => void importExpenses(e.target.files?.[0])} style={{ display: 'none' }} />
            </div>
          </div>
        </Card>

        <Card hoverable title="Receipt archive" padding={0}>
          <div style={{ padding: '0 24px 20px' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 20 }}>
              <button onClick={() => receiptRef.current?.click()} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 12px', fontWeight: 800 }}>Upload receipt</button>
              <input ref={receiptRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" capture="environment" multiple onChange={e => void storeReceiptFiles(e.target.files)} style={{ display: 'none' }} />
            </div>
            <span style={{ color: 'var(--muted)', fontSize: 13 }}>Stored locally in the app for finance records. Photos, PDFs, and files are accepted.</span>
          </div>
          {receipts.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No receipts uploaded yet.</div>}
          {receipts.slice().sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 8).map(r => (
            <div key={r.id} className="card-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
              <a href={r.dataUrl} download={r.fileName} style={{ color: 'inherit', textDecoration: 'none', fontWeight: 700 }}>
                {r.fileName}
                <span style={{ color: 'var(--muted)', fontWeight: 400 }}> - {(r.size / 1024).toFixed(1)} KB</span>
              </a>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{new Date(r.uploadedAt).toLocaleDateString()}</span>
              <button onClick={() => removeReceipt(r.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          ))}
        </Card>

        <Card hoverable title="Log wastage">
          <div style={{ display: 'grid', gap: 10 }}>
            <input type="date" value={wastageForm.date} onChange={e => setWastageForm({ ...wastageForm, date: e.target.value })} style={input} />
            <input value={wastageForm.itemName} onChange={e => setWastageForm({ ...wastageForm, itemName: e.target.value })} placeholder="Item, e.g. Oranges" style={input} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 8 }}>
              <input type="number" value={wastageForm.qty} onChange={e => setWastageForm({ ...wastageForm, qty: e.target.value })} placeholder="Qty optional" style={input} />
              <input value={wastageForm.unit} onChange={e => setWastageForm({ ...wastageForm, unit: e.target.value })} placeholder="Unit" style={input} />
            </div>
            <input type="number" value={wastageForm.amountQar} onChange={e => setWastageForm({ ...wastageForm, amountQar: e.target.value })} placeholder="Money lost QAR optional" style={input} />
            <input value={wastageForm.reason} onChange={e => setWastageForm({ ...wastageForm, reason: e.target.value })} placeholder="Reason, e.g. expired" style={input} />
            <textarea value={wastageForm.notes} onChange={e => setWastageForm({ ...wastageForm, notes: e.target.value })} placeholder="Notes" rows={2} style={{ ...input, fontFamily: 'inherit' }} />
            <button onClick={saveWastage} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}>Save wastage</button>
          </div>
        </Card>

        <Card hoverable title={`Expenses (${summary.expenses.length})`} padding={0}>
          {summary.expenses.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No expenses for this month.</div>}
          {summary.expenses.slice().sort((a, b) => b.timestamp - a.timestamp).map(e => (
            <div key={e.id} className="card-row" style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto auto', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>{e.date}</span>
              <span><strong>{e.description || EXPENSE_CATEGORY_LABELS[e.category]}</strong>{e.vendor ? ` - ${e.vendor}` : ''}</span>
              <strong>{formatQar(e.amountQar)}</strong>
              <button onClick={() => removeExpense(e.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          ))}
        </Card>

        <Card hoverable title={`Wastage (${summary.wastages.length})`} padding={0}>
          {summary.wastages.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No wastage logged for this month.</div>}
          {summary.wastages.slice().sort((a, b) => b.timestamp - a.timestamp).map(w => (
            <div key={w.id} className="card-row" style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto auto', gap: 10, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>{w.date}</span>
              <span>
                <strong>{w.itemName}</strong>
                {w.qty ? ` - ${w.qty}${w.unit ? ` ${w.unit}` : ''}` : ''}
                {w.reason ? ` - ${w.reason}` : ''}
              </span>
              <strong>{w.amountQar ? formatQar(w.amountQar) : 'No amount'}</strong>
              <button onClick={() => removeWastage(w.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
