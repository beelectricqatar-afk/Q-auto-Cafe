import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { FinanceExpense, FinanceReceipt, Ingredient } from '../../db/schema'
import { Card } from '../../components/Card'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { todayKey } from '../../domain/finance'
import { BULK_UNIT, applyPurchase, formatUnitPrice, priceChangePct, unitPrice, type PaidBy, type PurchaseResult } from '../../domain/purchase'
import { TrashIcon } from './sidebarIcons'

const INK = '#1A1A1A'
const input: CSSProperties = { padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 16, background: '#fff', color: 'var(--ink)', width: '100%' }
const label: CSSProperties = { display: 'grid', gap: 6, fontSize: 14, fontWeight: 600 }
const errText: CSSProperties = { color: 'var(--danger)', fontSize: 13, fontWeight: 600 }
const bad = (on: boolean): CSSProperties => (on ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 1px var(--danger)' } : {})
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
}

const bulkOf = (r: Row) => (r.ingredient ? BULK_UNIT[r.ingredient.unit] : undefined)
const typedUnit = (r: Row) => (r.ingredient ? (r.bulk && bulkOf(r) ? bulkOf(r)!.unit : r.ingredient.unit) : '')
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

/**
 * Picks what was bought from the inventory, or names something that is not
 * stocked (gloves, a delivery charge) so it can still go on the receipt.
 */
function ItemPicker({ ingredients, onPick }: { ingredients: Ingredient[]; onPick: (pick: Ingredient | string) => void }) {
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const listId = useId()
  const q = query.trim().toLowerCase()
  const matches = q ? ingredients.filter(i => i.name.toLowerCase().includes(q)).slice(0, 6) : []
  const options: (Ingredient | string)[] = q ? [...matches, query.trim()] : []
  const pick = (o: Ingredient | string) => { onPick(o); setQuery(''); setHighlight(0) }

  return (
    <div style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setHighlight(0) }}
        onKeyDown={e => {
          if (!options.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % options.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + options.length) % options.length) }
          else if (e.key === 'Enter') { e.preventDefault(); pick(options[highlight]) }
          else if (e.key === 'Escape') setQuery('')
        }}
        placeholder="Add an item from the receipt, e.g. milk"
        aria-label="Add an item from the receipt"
        role="combobox"
        aria-expanded={options.length > 0}
        aria-controls={listId}
        style={input}
      />
      {options.length > 0 && (
        <div id={listId} role="listbox" style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 4px)', zIndex: 30, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, boxShadow: '0 10px 30px rgba(16,24,40,.12)', overflow: 'hidden' }}>
          {options.map((o, i) => (
            <button
              key={typeof o === 'string' ? 'free' : o.id}
              type="button"
              role="option"
              aria-selected={i === highlight}
              onMouseDown={e => e.preventDefault()}
              onClick={() => pick(o)}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', textAlign: 'left', padding: '10px 14px', border: 'none', borderTop: i ? '1px solid #f0f0f0' : 'none', background: i === highlight ? '#F4F5F6' : '#fff', fontSize: 15, color: 'var(--ink)' }}
            >
              {typeof o === 'string'
                ? <><span>Add “{o}” (not a stock item)</span><span style={{ color: 'var(--muted)' }}>expense only</span></>
                : <><span style={{ fontWeight: 600 }}>{o.name}</span><span style={{ color: 'var(--muted)' }}>{o.stockQty} {o.unit} in stock</span></>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** "↑ 48% from 0.90" — what changed since the last receipt, so a jump is noticed. */
function PriceChange({ row }: { row: Row }) {
  const ing = row.ingredient
  if (!ing) return <span style={{ color: 'var(--muted)', fontSize: 13 }}>expense only</span>
  const qty = stockQtyOf(row), total = totalOf(row)
  if (!(qty > 0 && total > 0)) return null
  const now = unitPrice({ qty, totalQar: total })
  const pct = priceChangePct(now, ing.unitCostQar)
  if (pct == null) return <span style={{ color: 'var(--muted)', fontSize: 13 }}>first price recorded</span>
  if (pct === 0) return <span style={{ color: 'var(--muted)', fontSize: 13 }}>same as last time</span>
  const per = factor(row)
  return (
    <span style={{ fontSize: 13, fontWeight: 600, color: pct > 0 ? '#B54708' : '#027A48' }}>
      {pct > 0 ? '↑' : '↓'} {Math.abs(pct)}% from {formatUnitPrice(ing.unitCostQar! * per)}
    </span>
  )
}

/**
 * Records a purchase from its receipt: stock goes up, each item's cost becomes
 * what was paid, and the receipt total lands in expenses — in one step.
 *
 * It needs no request behind it: the team often buys something nobody asked for.
 */
export function PurchaseScreen({ data, refresh, onClose }: { data: Data; refresh: () => Promise<void>; onClose: () => void }) {
  const toast = useToast()
  const [vendor, setVendor] = useState('')
  const [receiptNumber, setReceiptNumber] = useState('')
  const [date, setDate] = useState(() => todayKey())
  const [paidBy, setPaidBy] = useState<PaidBy>('Cash')
  const [photo, setPhoto] = useState<Awaited<ReturnType<typeof readPhoto>> | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [tried, setTried] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // The ingredients as they were when saved: the refresh that follows replaces `data`.
  const [result, setResult] = useState<{ outcome: PurchaseResult; before: Ingredient[] } | null>(null)
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

  const dirty = !!(vendor || receiptNumber || photo || rows.length)
  const total = round2(rows.reduce((sum, r) => sum + totalOf(r), 0))
  const update = (key: string, patch: Partial<Row>) => setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))

  const add = (pick: Ingredient | string) => {
    if (typeof pick !== 'string' && rows.some(r => r.ingredient?.id === pick.id)) { toast(`${pick.name} is already on the receipt`, 'warn'); return }
    const row: Row = typeof pick === 'string'
      ? { key: crypto.randomUUID(), name: pick.charAt(0).toUpperCase() + pick.slice(1), qty: '1', bulk: false, mode: 'total', paid: '', each: '' }
      : { key: crypto.randomUUID(), ingredient: pick, name: pick.name, qty: '', bulk: !!BULK_UNIT[pick.unit], mode: 'total', paid: '', each: '' }
    setRows(rs => [...rs, row])
  }

  const rowErrors = (r: Row) => ({ qty: !(qtyOf(r) > 0), paid: !(totalOf(r) > 0) })
  const problems = useMemo(() => {
    const p: string[] = []
    if (!vendor.trim()) p.push('the vendor')
    if (!receiptNumber.trim()) p.push('the receipt number')
    if (!rows.length) p.push('at least one item')
    const noQty = rows.filter(r => rowErrors(r).qty).map(r => r.name)
    const noPaid = rows.filter(r => rowErrors(r).paid).map(r => r.name)
    if (noQty.length) p.push(`how many for ${noQty.join(', ')}`)
    if (noPaid.length) p.push(`the amount paid for ${noPaid.join(', ')}`)
    return p
  }, [vendor, receiptNumber, rows])

  const save = async () => {
    setTried(true)
    if (problems.length || saving) return
    setSaving(true)
    try {
      const receiptFileId = photo ? crypto.randomUUID() : undefined
      const outcome = applyPurchase({
        date, vendor, receiptNumber, paidBy, receiptFileId,
        lines: rows.map(r => ({ ingredientId: r.ingredient?.id, name: r.name, qty: stockQtyOf(r), totalQar: round2(totalOf(r)) })),
      }, data.ingredients)
      if (photo && receiptFileId) {
        await repo.put<FinanceReceipt>('financeReceipts', { id: receiptFileId, uploadedAt: Date.now(), ...photo, notes: `Receipt ${receiptNumber.trim()} · ${vendor.trim()}`, expenseId: outcome.expense.id })
      }
      for (const ing of outcome.ingredients) await repo.put('ingredients', ing)
      for (const adj of outcome.adjustments) await repo.put('inventoryAdjustments', adj)
      await repo.put('financeExpenses', outcome.expense)
      setResult({ outcome, before: data.ingredients })
      toast('Purchase saved')
      void refresh()
    } catch {
      toast('Could not save the purchase', 'warn')
    } finally {
      setSaving(false)
    }
  }

  const back = () => (dirty && !result ? setConfirmLeave(true) : onClose())

  if (result) return <PurchaseDone result={result.outcome} before={result.before} onClose={onClose} />

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1180 }}>
      <div>
        <button onClick={back} style={{ border: 'none', background: 'none', padding: 0, fontWeight: 700, color: 'var(--muted)', minHeight: 32 }}>← Requests</button>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>Add purchase</h2>
        <span style={{ color: 'var(--muted)', fontSize: 14 }}>Enter it straight from the receipt</span>
      </div>

      {confirmLeave && (
        <Card>
          <div role="alertdialog" aria-label="Leave this purchase" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ flex: 1, fontWeight: 600 }}>Leave without saving? What you have typed will be lost.</span>
            <button onClick={onClose} style={{ border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }}>Discard</button>
            <button onClick={() => setConfirmLeave(false)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 10, padding: '10px 14px', fontWeight: 700 }}>Keep editing</button>
          </div>
        </Card>
      )}

      <Card title="Receipt" actions={<span style={{ color: 'var(--muted)', fontSize: 13 }}><span style={{ color: 'var(--danger)' }}>*</span> required</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <label style={label}>
            <span>Vendor <span style={{ color: 'var(--danger)' }}>*</span></span>
            <input className="free-list" list={vendorList} value={vendor} onChange={e => setVendor(e.target.value)} placeholder="Type any vendor" autoComplete="off" aria-invalid={tried && !vendor.trim()} style={{ ...input, ...bad(tried && !vendor.trim()) }} />
            <datalist id={vendorList}>{vendors.map(v => <option key={v} value={v} />)}</datalist>
          </label>
          <label style={label}>
            <span>Receipt number <span style={{ color: 'var(--danger)' }}>*</span></span>
            <input value={receiptNumber} onChange={e => setReceiptNumber(e.target.value)} placeholder="As printed on the receipt" autoComplete="off" aria-invalid={tried && !receiptNumber.trim()} style={{ ...input, ...bad(tried && !receiptNumber.trim()) }} />
          </label>
          <label style={label}>
            <span>Date</span>
            <input type="date" value={date} max={todayKey()} onChange={e => setDate(e.target.value || todayKey())} style={input} />
          </label>
          <div style={label}>
            <span id="paid-by">Paid by</span>
            <div role="group" aria-labelledby="paid-by" style={{ display: 'flex', gap: 4, background: '#F4F5F6', padding: 4, borderRadius: 10 }}>
              {(['Cash', 'Card'] as const).map(p => (
                <button key={p} type="button" aria-pressed={paidBy === p} onClick={() => setPaidBy(p)}
                  style={{ flex: 1, border: 'none', borderRadius: 8, padding: 8, fontWeight: 700, background: paidBy === p ? '#fff' : 'transparent', boxShadow: paidBy === p ? '0 1px 3px rgba(0,0,0,.12)' : 'none', color: 'var(--ink)' }}>{p}</button>
              ))}
            </div>
          </div>
          <div style={label}>
            <span>Receipt photo</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {photo && <img src={photo.dataUrl} alt="Receipt" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} />}
              <label style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                {photo ? 'Replace photo' : 'Add photo'}
                <input type="file" accept="image/*" capture="environment" aria-label="Receipt photo" style={{ display: 'none' }}
                  onChange={async e => { const f = e.target.files?.[0]; if (f) setPhoto(await readPhoto(f)); e.target.value = '' }} />
              </label>
              {photo && <button type="button" onClick={() => setPhoto(null)} style={{ border: 'none', background: 'none', color: 'var(--muted)', fontWeight: 600 }}>Remove</button>}
            </div>
          </div>
        </div>
      </Card>

      <Card title={`Items (${rows.length})`} padding={0} style={{ overflow: 'visible' }}
        actions={<span style={{ color: 'var(--muted)', fontSize: 13 }}>Type each line's total as printed. Fruit by weight? Count the pieces.</span>}>
        {rows.length === 0 && <div className="card-row" style={{ color: tried ? 'var(--danger)' : 'var(--muted)' }}>Add the items on the receipt below.</div>}
        {rows.map(r => {
          const errs = tried ? rowErrors(r) : { qty: false, paid: false }
          const unit = typedUnit(r), bulk = bulkOf(r)
          const per = qtyOf(r) > 0 && totalOf(r) > 0 ? totalOf(r) / qtyOf(r) : null
          return (
            <div key={r.key} className="card-row" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: '1 1 170px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{r.name}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 13 }}>{r.ingredient ? `${r.ingredient.stockQty} ${r.ingredient.unit} in stock` : 'not a stock item'}</div>
                </div>
                <button type="button" className="icon-btn danger" aria-label={`Remove ${r.name}`} onClick={() => setRows(rs => rs.filter(x => x.key !== r.key))}><TrashIcon /></button>
              </div>
              <div style={{ display: 'grid', gap: 4, flex: '1 1 170px' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>Qty bought</span>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" min="0" step="any" inputMode="decimal" value={r.qty} onChange={e => update(r.key, { qty: e.target.value })}
                    aria-label={`Quantity of ${r.name} bought${unit ? `, in ${unit}` : ''}`} aria-invalid={errs.qty} style={{ ...input, ...bad(errs.qty), minWidth: 0 }} />
                  {bulk && r.ingredient
                    ? <div role="group" aria-label={`Unit for ${r.name}`} style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
                        {[true, false].map(b => (
                          <button key={String(b)} type="button" aria-pressed={r.bulk === b} onClick={() => update(r.key, { bulk: b })}
                            style={{ border: 'none', padding: '0 10px', minHeight: 42, fontWeight: 700, background: r.bulk === b ? INK : '#fff', color: r.bulk === b ? '#fff' : 'var(--ink)' }}>
                            {b ? bulk.unit : r.ingredient!.unit}
                          </button>
                        ))}
                      </div>
                    : unit && <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{unit}</span>}
                </div>
              </div>
              <div style={{ display: 'grid', gap: 4, flex: '1 1 150px' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{r.mode === 'total' ? 'Paid (QAR)' : `Price each (QAR / ${unit || 'unit'})`}</span>
                {r.mode === 'total'
                  ? <input type="number" min="0" step="0.05" inputMode="decimal" value={r.paid} onChange={e => update(r.key, { paid: e.target.value })} placeholder="0.00"
                      aria-label={`Amount paid for ${r.name}, from the receipt`} aria-invalid={errs.paid} style={{ ...input, ...bad(errs.paid) }} />
                  : <input type="number" min="0" step="0.05" inputMode="decimal" value={r.each} onChange={e => update(r.key, { each: e.target.value })} placeholder="0.00"
                      aria-label={`Price per ${unit || 'unit'} of ${r.name}`} aria-invalid={errs.paid} style={{ ...input, ...bad(errs.paid) }} />}
                <button type="button" onClick={() => update(r.key, r.mode === 'total'
                  ? { mode: 'each', each: per != null ? String(round2(per)) : '' }
                  : { mode: 'total', paid: totalOf(r) > 0 ? String(totalOf(r)) : r.paid })}
                  style={{ justifySelf: 'start', border: 'none', background: 'none', padding: 0, minHeight: 24, color: 'var(--muted)', fontSize: 13, fontWeight: 600, textDecoration: 'underline' }}>
                  {r.mode === 'total' ? 'Enter price each' : 'Enter total instead'}
                </button>
              </div>
              <div style={{ display: 'grid', gap: 4, flex: '1 1 140px' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>{r.mode === 'total' ? 'Per unit' : 'Line total'}</span>
                <span style={{ fontWeight: 700, minHeight: 42, display: 'flex', alignItems: 'center' }}>
                  {r.mode === 'total'
                    ? (per != null ? `${formatUnitPrice(per)} / ${unit || 'each'}` : '–')
                    : formatQar(totalOf(r))}
                </span>
                <PriceChange row={r} />
              </div>
            </div>
          )
        })}
        <div style={{ padding: '14px 24px', borderTop: rows.length ? '1px solid #e5e5e5' : 'none' }}>
          <ItemPicker ingredients={data.ingredients} onPick={add} />
        </div>
        <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: '1px solid #e5e5e5', borderRadius: '0 0 16px 16px', padding: '16px 24px', display: 'grid', gap: 10 }}>
          {tried && problems.length > 0 && <div role="alert" style={errText}>Enter {problems.join(', ')}.</div>}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>Receipt total · {paidBy}</span>
            <strong style={{ fontSize: 22 }}>{formatQar(total)}</strong>
          </div>
          <button onClick={save} disabled={saving} aria-busy={saving}
            style={{ background: INK, color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 16, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : 'Save purchase and add to stock'}
          </button>
        </div>
      </Card>
    </div>
  )
}

/** What the purchase just changed, so the person entering it can trust it worked. */
function PurchaseDone({ result, before, onClose }: { result: PurchaseResult; before: Ingredient[]; onClose: () => void }) {
  const { expense } = result
  const old = new Map(before.map(i => [i.id, i]))
  const stock = result.ingredients.map(i => `${i.name}: ${old.get(i.id)?.stockQty ?? 0} → ${i.stockQty} ${i.unit}`)
  const prices = result.ingredients.flatMap(i => {
    const was = old.get(i.id)?.unitCostQar
    return was === i.unitCostQar ? [] : [`${i.name}: ${was != null ? formatUnitPrice(was) : 'none'} → ${formatUnitPrice(i.unitCostQar ?? 0)} per ${i.unit}`]
  })
  const others = expense.purchase?.lines.filter(l => !l.ingredientId).map(l => l.name) ?? []
  const list = (items: string[], empty: string) => (
    <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>{(items.length ? items : [empty]).map(s => <li key={s}>{s}</li>)}</ul>
  )
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1180 }}>
      <h2 style={{ margin: 0 }}>Purchase saved</h2>
      <Card title={`Receipt ${expense.reference ?? ''} · ${expense.vendor} · ${formatQar(expense.amountQar)} · ${expense.paymentMethod}`}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          <div><strong>Stock added</strong>{list(stock, 'No stock items')}</div>
          <div><strong>Prices updated</strong>{list(prices, 'Same prices as last time')}</div>
          <div><strong>Expense recorded</strong>{list([`${formatQar(expense.amountQar)}, Supplies, ${expense.paymentMethod}`, ...(others.length ? [`${others.join(', ')}: expense only`] : [])], '')}</div>
        </div>
        <button onClick={onClose} style={{ marginTop: 20, background: INK, color: '#fff', border: 'none', borderRadius: 10, padding: '12px 18px', fontWeight: 800 }}>Back to requests</button>
      </Card>
    </div>
  )
}
