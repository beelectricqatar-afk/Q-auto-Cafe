import { useEffect, useId, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { FinanceExpense, FinanceReceipt, Ingredient } from '../../db/schema'
import { Card } from '../../components/Card'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { todayKey } from '../../domain/finance'
import { BULK_UNIT, applyPurchase, formatUnitPrice, priceChangePct, unitPrice, type PaidBy, type PurchaseResult } from '../../domain/purchase'
import { TrashIcon } from './sidebarIcons'
import { formatQty, itemKey, type ShoppingItem } from '../../domain/shoppingList'
import { ItemPicker } from '../../components/ItemPicker'
import { Button, buttonVariants } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Field } from '../../components/ui/label'
import { Badge } from '../../components/ui/badge'
import { Checkbox } from '../../components/ui/checkbox'
import { ToggleGroup } from '../../components/ui/toggle-group'
import { cn } from '../../lib/utils'
const round2 = (n: number) => Math.round(n * 100) / 100

/** One line of the receipt as it is being typed. Numbers stay strings until saved. */
interface Row {
  key: string
  ingredient?: Ingredient
  name: string
  qty: string
  /** Typed in the bigger unit — L rather than ml — when the item has one. */
  bulk: boolean
  /** Line total from the receipt, or a price each with the total worked out. */
  mode: 'total' | 'each'
  paid: string
  each: string
  /** Asked for on the shopping list, in the stock unit. Absent for something added at the till. */
  asked?: number
  /** Ticked when it was actually bought. Unticked rows stay on the shopping list. */
  bought: boolean
  /** A unit typed on the request for something not in the inventory. */
  unitLabel?: string
}

const bulkOf = (r: Row) => (r.ingredient ? BULK_UNIT[r.ingredient.unit] : undefined)
const typedUnit = (r: Row) => (r.ingredient ? (r.bulk && bulkOf(r) ? bulkOf(r)!.unit : r.ingredient.unit) : r.unitLabel ?? '')
const factor = (r: Row) => (r.bulk && bulkOf(r) ? bulkOf(r)!.factor : 1)
const qtyOf = (r: Row) => Number(r.qty) || 0
const totalOf = (r: Row) => (r.mode === 'total' ? Number(r.paid) || 0 : round2((Number(r.each) || 0) * qtyOf(r)))
/** The quantity in the unit stock is counted in, which is what gets saved. */
const stockQtyOf = (r: Row) => Math.round(qtyOf(r) * factor(r) * 1000) / 1000

/** A photo off a phone is several MB; a receipt stays readable at a fraction of that. */
async function readPhoto(file: File): Promise<Pick<FinanceReceipt, 'dataUrl' | 'mimeType' | 'size' | 'fileName'>> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const original = { dataUrl: raw, mimeType: file.type || 'image/jpeg', size: file.size, fileName: file.name }
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = raw
      setTimeout(reject, 4000)
    })
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return original
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.75)
    return dataUrl.length < raw.length
      ? { dataUrl, mimeType: 'image/jpeg', size: Math.round(dataUrl.length * 0.75), fileName: file.name.replace(/\.\w+$/, '') + '.jpg' }
      : original
  } catch {
    return original
  }
}

/** "↑ 48% from 0.90" — what changed since the last receipt, so a jump is noticed. */
function PriceChange({ row }: { row: Row }) {
  const ing = row.ingredient
  if (!ing) return <Badge variant="outline">expense only</Badge>
  const qty = stockQtyOf(row), total = totalOf(row)
  if (!(qty > 0 && total > 0)) return null
  const now = unitPrice({ qty, totalQar: total })
  const pct = priceChangePct(now, ing.unitCostQar)
  if (pct == null) return <Badge>first price recorded</Badge>
  if (pct === 0) return <Badge>same as last time</Badge>
  const per = factor(row)
  return (
    <Badge variant={pct > 0 ? 'warning' : 'success'}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}% from {formatUnitPrice(ing.unitCostQar! * per)}
    </Badge>
  )
}

/**
 * Records a purchase from its receipt: stock goes up, each item's cost becomes
 * what was paid, and the receipt total lands in expenses — in one step.
 *
 * It needs no request behind it: the team often buys something nobody asked for.
 */
/** Rows for each item on the shopping list, filled with what was asked for. */
function rowsFor(items: ShoppingItem[], ingredients: Ingredient[]): Row[] {
  const byId = new Map(ingredients.map(i => [i.id, i]))
  return items.map(item => {
    const ingredient = item.ingredientId ? byId.get(item.ingredientId) : undefined
    const bulk = ingredient && BULK_UNIT[ingredient.unit]
    const inBulk = !!bulk && item.total >= bulk.factor
    const qty = inBulk ? item.total / bulk!.factor : item.total
    return {
      key: crypto.randomUUID(), ingredient, name: item.name, unitLabel: item.unitLabel,
      qty: String(Math.round(qty * 1000) / 1000), bulk: inBulk, mode: 'total', paid: '', each: '',
      asked: item.total, bought: true,
    }
  })
}

export interface Receiving {
  /** What is on the shopping list, to start the receipt from. */
  items: ShoppingItem[]
  /** Called once the purchase is saved, with what was bought per item; returns a line per request. */
  onReceived: (bought: Map<string, number>) => Promise<string[]>
}

export function PurchaseScreen({ data, refresh, onClose, receiving }: { data: Data; refresh: () => Promise<void>; onClose: () => void; receiving?: Receiving }) {
  const toast = useToast()
  const [vendor, setVendor] = useState('')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [date, setDate] = useState(() => todayKey())
  const [paidBy, setPaidBy] = useState<PaidBy>('Cash')
  const [photo, setPhoto] = useState<Awaited<ReturnType<typeof readPhoto>> | null>(null)
  const [rows, setRows] = useState<Row[]>(() => (receiving ? rowsFor(receiving.items, data.ingredients) : []))
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // The ingredients as they were when saved: the refresh that follows replaces `data`.
  const [result, setResult] = useState<{ outcome: PurchaseResult; before: Ingredient[]; requestNotes?: string[] } | null>(null)
  const [vendors, setVendors] = useState<string[]>([])
  const vendorList = useId()

  // Vendors already used are offered as you type; any other name is fine too.
  useEffect(() => {
    let live = true
    repo.all<FinanceExpense>('financeExpenses')
      .then(rows => { if (live) setVendors([...new Set(rows.map(e => e.vendor.trim()).filter(Boolean))].sort()) })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const dirty = !!(vendor || receiptNumber || photo || (receiving ? rows.some(r => r.paid || r.each) : rows.length))
  const bought = rows.filter(r => r.bought)
  const total = round2(bought.reduce((sum, r) => sum + totalOf(r), 0))
  const update = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))

  const add = (pick: Ingredient | string) => {
    if (typeof pick !== 'string' && rows.some(r => r.ingredient?.id === pick.id)) { toast(`${pick.name} is already on the receipt`, 'warn'); return }
    const row: Row = typeof pick === 'string'
      ? { key: crypto.randomUUID(), name: pick.charAt(0).toUpperCase() + pick.slice(1), qty: '1', bulk: false, mode: 'total', paid: '', each: '', bought: true }
      : { key: crypto.randomUUID(), ingredient: pick, name: pick.name, qty: '', bulk: !!BULK_UNIT[pick.unit], mode: 'total', paid: '', each: '', bought: true }
    setRows(rs => [...rs, row])
  }

  const rowErrors = (r: Row) => ({ qty: !(qtyOf(r) > 0), paid: !(totalOf(r) > 0) })
  const problems = useMemo(() => {
    const p: string[] = []
    if (!vendor.trim()) p.push('the vendor')
    if (!receiptNumber.trim()) p.push('the receipt number')
    if (!bought.length) p.push(receiving ? 'at least one item you bought (ticked)' : 'at least one item')
    const noQty = bought.filter(r => rowErrors(r).qty).map(r => r.name)
    const noPaid = bought.filter(r => rowErrors(r).paid).map(r => r.name)
    if (noQty.length) p.push(`how many for ${noQty.join(', ')}`)
    if (noPaid.length) p.push(`the amount paid for ${noPaid.join(', ')}`)
    return p
  }, [vendor, receiptNumber, bought, receiving])

  const save = async () => {
    setTried(true)
    if (problems.length || saving) return
    setSaving(true)
    try {
      const receiptFileId = photo ? crypto.randomUUID() : undefined
      const outcome = applyPurchase({
        date, vendor, receiptNumber, paidBy, receiptFileId,
        lines: bought.map(r => ({ ingredientId: r.ingredient?.id, name: r.name, qty: stockQtyOf(r), totalQar: round2(totalOf(r)) })),
      }, data.ingredients)
      if (photo && receiptFileId) {
        await repo.put<FinanceReceipt>('financeReceipts', { id: receiptFileId, uploadedAt: Date.now(), ...photo, notes: `Receipt ${receiptNumber.trim()} · ${vendor.trim()}`, expenseId: outcome.expense.id })
      }
      for (const ing of outcome.ingredients) await repo.put('ingredients', ing)
      for (const adj of outcome.adjustments) await repo.put('inventoryAdjustments', adj)
      await repo.put('financeExpenses', outcome.expense)
      // The purchase is saved whatever happens next; the requests live in the
      // cloud, so marking them received can fail on its own without losing it.
      let requestNotes: string[] | undefined
      if (receiving) {
        const got = new Map<string, number>()
        for (const r of bought) {
          const key = itemKey({ ingredientId: r.ingredient?.id, name: r.name })
          got.set(key, (got.get(key) ?? 0) + stockQtyOf(r))
        }
        try { requestNotes = await receiving.onReceived(got) }
        catch { requestNotes = ['Could not update the requests (no connection). Mark them done by hand once online.'] }
      }
      setResult({ outcome, before: data.ingredients, requestNotes })
      toast(receiving ? 'Received' : 'Purchase saved')
      void refresh()
    } catch {
      toast('Could not save the purchase', 'warn')
    } finally {
      setSaving(false)
    }
  }

  const back = () => (dirty && !result ? setConfirmLeave(true) : onClose())

  if (result) return <PurchaseDone result={result.outcome} before={result.before} requestNotes={result.requestNotes} onClose={onClose} />

  const stays = rows.filter(r => r.asked != null && (!r.bought || stockQtyOf(r) < r.asked)).length

  return (
    <div className="grid max-w-[1180px] gap-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground" onClick={back}>← Requests</Button>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-2xl font-medium">{receiving ? 'Receive' : 'Add purchase'}</h2>
        <span className="text-sm text-muted-foreground">{receiving ? 'Untick anything you could not buy; it stays on the shopping list' : 'Enter it straight from the receipt'}</span>
      </div>

      {confirmLeave && (
        <div role="alertdialog" aria-label="Leave this purchase" className="flex flex-wrap items-center gap-2.5 rounded-control border border-[#FEDF89] bg-warning-soft p-4">
          <span className="flex-1 text-sm font-medium">Leave without saving? What you have typed will be lost.</span>
          <Button variant="outline" size="sm" onClick={onClose}>Discard</Button>
          <Button size="sm" onClick={() => setConfirmLeave(false)}>Keep editing</Button>
        </div>
      )}

      <Card title="Receipt" actions={<span className="text-xs text-muted-foreground"><span className="text-destructive">*</span> required</span>}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
          <Field label="Vendor" htmlFor="purchase-vendor" required>
            <Input id="purchase-vendor" className="free-list" list={vendorList} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Type any vendor" autoComplete="off" aria-invalid={tried && !vendor.trim()} />
            <datalist id={vendorList}>{vendors.map(v => <option key={v} value={v} />)}</datalist>
          </Field>
          <Field label="Receipt number" htmlFor="purchase-ref" required>
            <Input id="purchase-ref" value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="As printed on the receipt" autoComplete="off" aria-invalid={tried && !receiptNumber.trim()} />
          </Field>
          <Field label="Date" htmlFor="purchase-date">
            <Input id="purchase-date" type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value || todayKey())} />
          </Field>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Paid by</span>
            <ToggleGroup label="Paid by" fullWidth value={paidBy} onChange={setPaidBy} options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }]} />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Receipt photo</span>
            <div className="flex items-center gap-2.5">
              {photo && <img src={photo.dataUrl} alt="Receipt" className="size-12 rounded-[10px] border border-border object-cover" />}
              <label className={cn(buttonVariants({ variant: 'outline' }))}>
                {photo ? 'Replace photo' : 'Add photo'}
                <input type="file" accept="image/*" capture="environment" aria-label="Receipt photo" style={{ display: 'none' }}
                  onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await readPhoto(f)); e.target.value = '' }} />
              </label>
              {photo && <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setPhoto(null)}>Remove</Button>}
            </div>
          </div>
        </div>
      </Card>

      <Card title={`Items (${rows.length})`} padding={0} style={{ overflow: 'visible' }}
        actions={<span className="text-xs text-muted-foreground">Type each line's total as printed. Fruit by weight? Count the pieces.</span>}>
        {rows.length === 0 && <div className={cn('card-row', tried ? 'text-destructive' : 'text-muted-foreground')}>Add the items on the receipt below.</div>}
        {rows.map(r => {
          const errs = tried ? rowErrors(r) : { qty: false, paid: false }
          const unit = typedUnit(r), bulk = bulkOf(r)
          const per = qtyOf(r) > 0 && totalOf(r) > 0 ? totalOf(r) / qtyOf(r) : null
          return (
            <div key={r.key} className={cn('card-row flex flex-wrap items-start gap-3', !r.bought && 'bg-[#FAFAFA]')}>
              <div className="flex flex-[1_1_170px] items-start justify-between gap-2.5">
                {r.asked != null && (
                  <Checkbox checked={r.bought} aria-label={`Bought ${r.name}`} className="mt-0.5"
                    onChange={e => update(r.key, { bought: e.target.checked })} />
                )}
                <div className={cn('min-w-0 flex-1', !r.bought && 'opacity-50')}>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.ingredient ? `${r.ingredient.stockQty} ${r.ingredient.unit} in stock` : 'not a stock item'}
                    {r.asked != null && ` · asked ${formatQty(r.asked, r.ingredient?.unit, r.unitLabel)}`}
                  </div>
                </div>
                {r.asked == null && <button type="button" className="icon-btn danger" aria-label={`Remove ${r.name}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><TrashIcon /></button>}
              </div>
              {!r.bought && <div className="flex-[3_1_300px] self-center"><Badge variant="warning">Not bought · stays on the shopping list</Badge></div>}
              {r.bought && <>
              <div className="grid flex-[1_1_170px] gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Qty bought</span>
                <div className="flex items-center gap-1.5">
                  {bulk && r.ingredient
                    ? <>
                        <Input type="number" min="0" step="any" inputMode="decimal" value={r.qty} onChange={e => update(r.key, { qty: e.target.value })}
                          aria-label={`Quantity of ${r.name} bought${unit ? `, in ${unit}` : ''}`} aria-invalid={errs.qty} />
                        <ToggleGroup size="sm" label={`Unit for ${r.name}`} value={r.bulk ? 'bulk' : 'stock'} onChange={v => update(r.key, { bulk: v === 'bulk' })}
                          options={[{ value: 'bulk', label: bulk.unit }, { value: 'stock', label: r.ingredient.unit }]} />
                      </>
                    : <Input type="number" min="0" step="any" inputMode="decimal" value={r.qty} onChange={e => update(r.key, { qty: e.target.value })}
                        aria-label={`Quantity of ${r.name} bought${unit ? `, in ${unit}` : ''}`} aria-invalid={errs.qty} suffix={unit || undefined} />}
                </div>
              </div>
              <div className="grid flex-[1_1_150px] gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{r.mode === 'total' ? 'Paid' : `Price each, per ${unit || 'unit'}`}</span>
                {r.mode === 'total'
                  ? <Input type="number" min="0" step="0.05" inputMode="decimal" value={r.paid} onChange={e => update(r.key, { paid: e.target.value })} placeholder="0.00"
                      aria-label={`Amount paid for ${r.name}, from the receipt`} aria-invalid={errs.paid} suffix="QAR" />
                  : <Input type="number" min="0" step="0.05" inputMode="decimal" value={r.each} onChange={e => update(r.key, { each: e.target.value })} placeholder="0.00"
                      aria-label={`Price per ${unit || 'unit'} of ${r.name}`} aria-invalid={errs.paid} suffix="QAR" />}
                <Button variant="link" className="justify-self-start text-xs" onClick={() => update(r.key, r.mode === 'total'
                  ? { mode: 'each', each: per != null ? String(round2(per)) : '' }
                  : { mode: 'total', paid: totalOf(r) > 0 ? String(totalOf(r)) : r.paid })}>
                  {r.mode === 'total' ? 'Enter price each' : 'Enter total instead'}
                </Button>
              </div>
              <div className="grid flex-[1_1_140px] justify-items-start gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">{r.mode === 'total' ? 'Per unit' : 'Line total'}</span>
                <span className="flex h-control items-center font-semibold tabular-nums">
                  {r.mode === 'total'
                    ? (per != null ? `${formatUnitPrice(per)} / ${unit || 'each'}` : '–')
                    : formatQar(totalOf(r))}
                </span>
                <PriceChange row={r} />
                {r.asked != null && qtyOf(r) > 0 && stockQtyOf(r) < r.asked && (
                  <Badge variant="warning">{formatQty(Math.round((r.asked - stockQtyOf(r)) * 1000) / 1000, r.ingredient?.unit, r.unitLabel)} still to buy</Badge>
                )}
              </div>
              </>}
            </div>
          )
        })}
        <div className={cn('px-7 py-4', rows.length > 0 && 'border-t border-divider')}>
          <ItemPicker ingredients={data.ingredients} onPick={add} {...(receiving && { label: 'Add something that was not on the list', placeholder: 'Add something that was not on the list' })} />
        </div>
        <div className="sticky bottom-0 grid gap-2.5 rounded-b-card border-t border-divider bg-card px-7 py-5">
          {tried && problems.length > 0 && <div role="alert" className="text-sm font-semibold text-destructive">Enter {problems.join(', ')}.</div>}
          {receiving && (
            <div aria-live="polite" className="text-sm font-medium">
              {bought.length} of {rows.length} item{rows.length === 1 ? '' : 's'} bought
              <span className={cn('ml-2', stays ? 'text-warning' : 'text-success')}>{stays ? `· ${stays} stay${stays === 1 ? 's' : ''} on the shopping list` : '· nothing left on the list'}</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Receipt total · {paidBy}</span>
            <strong className="text-2xl font-semibold tabular-nums">{formatQar(total)}</strong>
          </div>
          <Button size="lg" onClick={save} disabled={saving} aria-busy={saving}>
            {saving ? 'Saving…' : receiving ? 'Receive and add to stock' : 'Save purchase and add to stock'}
          </Button>
        </div>
      </Card>
    </div>
  )
}

/** What the purchase just changed, so the person entering it can trust it worked. */
function PurchaseDone({ result, before, requestNotes, onClose }: { result: PurchaseResult; before: Ingredient[]; requestNotes?: string[]; onClose: () => void }) {
  const { expense } = result
  const old = new Map(before.map(i => [i.id, i]))
  const stock = result.ingredients.map(i => `${i.name}: ${old.get(i.id)?.stockQty ?? 0} → ${i.stockQty} ${i.unit}`)
  const prices = result.ingredients.flatMap(i => {
    const was = old.get(i.id)?.unitCostQar
    return was === i.unitCostQar ? [] : [`${i.name}: ${was != null ? formatUnitPrice(was) : 'none'} → ${formatUnitPrice(i.unitCostQar ?? 0)} per ${i.unit}`]
  })
  const others = expense.purchase?.lines.filter(l => !l.ingredientId).map(l => l.name) ?? []
  const list = (items: string[], empty: string) => (
    <ul className="mt-1.5 mb-0 grid gap-1 pl-[18px] text-sm tabular-nums">{(items.length ? items : [empty]).map(s => <li key={s}>{s}</li>)}</ul>
  )
  return (
    <div className="grid max-w-[1180px] gap-4">
      <h2 className="m-0 text-2xl font-medium">Purchase saved</h2>
      <Card title={`Receipt ${expense.reference ?? ''} · ${expense.vendor} · ${formatQar(expense.amountQar)} · ${expense.paymentMethod}`}>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-5">
          <div><strong className="font-semibold">Stock added</strong>{list(stock, 'No stock items')}</div>
          <div><strong className="font-semibold">Prices updated</strong>{list(prices, 'Same prices as last time')}</div>
          {requestNotes && <div><strong className="font-semibold">Requests</strong>{list(requestNotes, 'No request was waiting for these')}</div>}
          <div><strong className="font-semibold">Expense recorded</strong>{list([`${formatQar(expense.amountQar)}, Supplies, ${expense.paymentMethod}`, ...(others.length ? [`${others.join(', ')}: expense only`] : [])], '')}</div>
        </div>
        <Button className="mt-5" onClick={onClose}>Back to requests</Button>
      </Card>
    </div>
  )
}
