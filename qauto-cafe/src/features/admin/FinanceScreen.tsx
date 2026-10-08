import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { DeletionLog, FinanceExpense, FinanceReceipt, FinanceWastage, Order } from '../../db/schema'
import { useToast } from '../../components/Toast'
import { exportXlsx } from '../../domain/xlsx'
import { formatQar } from '../../domain/money'
import { buildFinanceSummary, currentMonthKey, dayRange, makeWastage, monthSpanRange, profitSplit, todayKey } from '../../domain/finance'
import { exportBusinessSummaryPdf, exportDetailedSales, exportExpenses } from '../../domain/financeExports'
import { Card } from '../../components/Card'
import { MetricCard } from '../../components/MetricCard'
import { MonthRangePicker } from '../../components/MonthRangePicker'
import { DollarIcon, PercentIcon, InventoryIcon, TrashIcon, WalletIcon, TrendUpIcon } from './sidebarIcons'
import { Button } from '../../components/ui/button'
import { Input, Textarea } from '../../components/ui/input'
import { ToggleGroup } from '../../components/ui/toggle-group'
import { useConfirm } from '../../components/ui/confirm-dialog'

interface WastageForm {
  date: string
  itemName: string
  qty: string
  unit: string
  amountQar: string
  reason: string
  notes: string
}

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
  const { confirm, dialog } = useConfirm()
  const receiptRef = useRef<HTMLInputElement | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [expenses, setExpenses] = useState<FinanceExpense[]>([])
  const [receipts, setReceipts] = useState<FinanceReceipt[]>([])
  const [wastages, setWastages] = useState<FinanceWastage[]>([])
  const [deletionLogs, setDeletionLogs] = useState<DeletionLog[]>([])
  // Report whole months (one or a run of them) or an explicit run of days.
  const [rangeMode, setRangeMode] = useState<'month' | 'days'>('month')
  const [monthKey, setMonthKey] = useState(currentMonthKey())
  const [toMonthKey, setToMonthKey] = useState(currentMonthKey())
  const [fromDay, setFromDay] = useState(todayKey())
  const [toDay, setToDay] = useState(todayKey())
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
    () => rangeMode === 'month' ? monthSpanRange(monthKey, toMonthKey) : dayRange(fromDay, toDay),
    [rangeMode, monthKey, toMonthKey, fromDay, toDay],
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

  // Net sales split by order; COGS is apportioned by each stream's share of them.
  const profitBreakdown = useMemo(() => {
    const split = profitSplit(summary)
    return [
      { label: 'Departments', value: formatQar(split.departments) },
      { label: 'Walk-in', value: formatQar(split.walkin) },
    ]
  }, [summary])

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
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="m-0 text-2xl font-semibold tracking-tight">Finance</h2>
          <div className="text-sm text-muted-foreground">{summary.range.label}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            label="Period"
            value={rangeMode}
            onChange={setRangeMode}
            options={[{ value: 'month', label: 'Month' }, { value: 'days', label: 'Days' }]}
          />
          {rangeMode === 'month'
            ? <MonthRangePicker from={monthKey} to={toMonthKey} onChange={(from, to) => { setMonthKey(from); setToMonthKey(to) }} />
            : (
              <>
                <Input type="date" value={fromDay} onChange={e => setFromDay(e.target.value)} aria-label="From date" className="w-auto" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" value={toDay} onChange={e => setToDay(e.target.value)} aria-label="To date" className="w-auto" />
              </>
            )}
          <Button variant="outline" size="sm" onClick={exportBillingStatement}>Billing Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportDetailedSales(summary.orders, data, range.key)}>Sales Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportExpenses(summary.expenses, range.key)}>Expenses Excel</Button>
          <Button size="sm" onClick={() => exportBusinessSummaryPdf(summary)}>Summary PDF</Button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <MetricCard valueSize={22} icon={DollarIcon} label="Gross sales" value={formatQar(summary.grossSales)} />
        <MetricCard valueSize={22} icon={PercentIcon} label="Discounts" value={formatQar(summary.discounts)} tone={summary.discounts > 0 ? 'bad' : 'normal'} />
        <MetricCard valueSize={22} icon={TrashIcon} label="Wastage" value={formatQar(summary.wastageTotal)} tone={summary.wastageTotal > 0 ? 'bad' : 'normal'} />
        <MetricCard valueSize={22} icon={WalletIcon} label="Expenses" value={formatQar(summary.expenseTotal)} />
        <MetricCard valueSize={22} icon={DollarIcon} label="Net sales" value={formatQar(summary.netSales)} tone="good" />
        <MetricCard valueSize={22} icon={InventoryIcon} label="COGS" value={formatQar(summary.cogs)} />
        <MetricCard
          valueSize={22} icon={TrendUpIcon} label="Gross profit"
          value={formatQar(summary.grossProfit)} tone={summary.grossProfit >= 0 ? 'good' : 'bad'}
          breakdown={profitBreakdown}
        />
        <MetricCard
          valueSize={22} icon={TrendUpIcon} label="Net profit"
          value={formatQar(summary.netProfit)} tone={summary.netProfit >= 0 ? 'good' : 'bad'}
          breakdown={profitBreakdown}
        />
      </div>

      {/* Without any costs logged, profit just equals sales — say so rather than
          letting a 100% margin read as a real result. */}
      {summary.cogs === 0 && summary.netSales > 0 && (
        <div role="status" className="rounded-card border border-[#FEDF89] bg-warning-soft px-6 py-4 text-sm">
          <strong className="font-semibold text-warning">No costs recorded for this period.</strong> COGS is expenses plus wastage, and
          neither has been logged, so profit below is simply net sales. Log wastage below and
          expenses on the Requests page to make these figures meaningful.
        </div>
      )}

      <div className="grid grid-cols-[minmax(280px,420px)_1fr] items-start gap-4">
        <Card hoverable title="Log wastage">
          <div className="grid gap-3">
            <Input type="date" value={wastageForm.date} onChange={e => setWastageForm({ ...wastageForm, date: e.target.value })} aria-label="Wastage date" />
            <Input value={wastageForm.itemName} onChange={e => setWastageForm({ ...wastageForm, itemName: e.target.value })} placeholder="Item, e.g. Oranges" />
            <div className="grid grid-cols-[1fr_110px] gap-2">
              <Input type="number" value={wastageForm.qty} onChange={e => setWastageForm({ ...wastageForm, qty: e.target.value })} placeholder="Qty optional" />
              <Input value={wastageForm.unit} onChange={e => setWastageForm({ ...wastageForm, unit: e.target.value })} placeholder="Unit" />
            </div>
            <Input type="number" value={wastageForm.amountQar} onChange={e => setWastageForm({ ...wastageForm, amountQar: e.target.value })} placeholder="Money lost QAR optional" />
            <Input value={wastageForm.reason} onChange={e => setWastageForm({ ...wastageForm, reason: e.target.value })} placeholder="Reason, e.g. expired" />
            <Textarea value={wastageForm.notes} onChange={e => setWastageForm({ ...wastageForm, notes: e.target.value })} placeholder="Notes" rows={2} />
            <Button size="lg" onClick={saveWastage}>Save wastage</Button>
          </div>
        </Card>

        <Card hoverable title={`Wastage (${summary.wastages.length})`} padding={0}>
          {summary.wastages.length === 0 && <div className="card-row text-muted-foreground">No wastage logged for this month.</div>}
          {summary.wastages.slice().sort((a, b) => b.timestamp - a.timestamp).map(w => (
            <div key={w.id} className="card-row grid grid-cols-[100px_1fr_auto_auto] items-center gap-3">
              <span className="text-xs text-muted-foreground tabular-nums">{w.date}</span>
              <span className="min-w-0">
                <strong className="font-semibold">{w.itemName}</strong>
                {w.qty ? ` - ${w.qty}${w.unit ? ` ${w.unit}` : ''}` : ''}
                {w.reason ? ` - ${w.reason}` : ''}
              </span>
              <strong className="font-semibold tabular-nums">{w.amountQar ? formatQar(w.amountQar) : 'No amount'}</strong>
              <button onClick={async () => { if (await confirm({ title: `Delete wastage of ${w.itemName}?`, description: 'It comes out of COGS for this period.' })) await removeWastage(w.id) }} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          ))}
        </Card>

        <Card hoverable title="Receipt archive" padding={0} style={{ gridColumn: '1 / -1' }}>
          <div className="grid gap-2 px-6 pt-2 pb-5">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => receiptRef.current?.click()}>Upload receipt</Button>
              <input ref={receiptRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" capture="environment" multiple onChange={e => void storeReceiptFiles(e.target.files)} style={{ display: 'none' }} />
            </div>
            <span className="text-xs text-muted-foreground">Stored locally in the app for finance records. Photos, PDFs, and files are accepted.</span>
          </div>
          {receipts.length === 0 && <div className="card-row text-muted-foreground">No receipts uploaded yet.</div>}
          {receipts.slice().sort((a, b) => b.uploadedAt - a.uploadedAt).slice(0, 8).map(r => (
            <div key={r.id} className="card-row grid grid-cols-[1fr_auto_auto] items-center gap-3">
              <a href={r.dataUrl} download={r.fileName} className="min-w-0 font-semibold text-inherit no-underline hover:underline">
                {r.fileName}
                <span className="font-normal text-muted-foreground"> · {(r.size / 1024).toFixed(1)} KB</span>
              </a>
              <span className="text-xs text-muted-foreground">{new Date(r.uploadedAt).toLocaleDateString()}</span>
              <button onClick={async () => { if (await confirm({ title: `Delete ${r.fileName}?`, description: 'The stored receipt file is removed from every device.' })) await removeReceipt(r.id) }} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          ))}
        </Card>
      </div>
      {dialog}
    </div>
  )
}
