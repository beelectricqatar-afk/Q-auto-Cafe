import { useCallback, useMemo, useState } from 'react'
import type { Request } from '../../db/schema'
import type { Data } from '../../app/useData'
import { client } from '../../sync/client'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { TrashIcon } from './sidebarIcons'
import { expenseDescriptionFor, requestItems, requestLines, type RequestItem } from '../../domain/requests'
import { branchLabel } from '../../domain/branch'
import { estimateCost } from '../../domain/estimateCost'
import { ExpensesPanel } from './ExpensesPanel'
import { useExpenseForm } from './useExpenseForm'
import type { RequestsState } from './useRequests'
import { PurchaseScreen } from './PurchaseScreen'
import { PurchasesCard } from './PurchasesCard'
import { RequestForm } from './RequestForm'
import { ShoppingListCard } from './ShoppingListCard'
import { CAFES, CAFE_LABEL, formatQty, outstanding, receive, shoppingList } from '../../domain/shoppingList'

// Requests live directly in the shared cloud (the `meta` table), so every
// device sees the same list. The list itself is held by the admin shell so the
// sidebar badge and this screen cannot disagree.
export function RequestsScreen({ data, state, refresh = async () => {} }: { data: Data; state: RequestsState; refresh?: () => Promise<void> }) {
  const { requests, loading, reload } = state
  const [viewing, setViewing] = useState<Request | null>(null)
  // Recording a purchase takes over the screen; the requests are still here after.
  const [purchasing, setPurchasing] = useState(false)
  const [receiving, setReceiving] = useState(false)
  // Open requests are on the shopping list unless unticked here. Kept as the
  // ones left out, so a request arriving from another device joins the list.
  const [leftOut, setLeftOut] = useState<Set<string>>(() => new Set())
  // Bumped when a purchase is undone, so the expense list beside it reloads.
  const [expensesVersion, setExpensesVersion] = useState(0)
  const toast = useToast()
  // Held here rather than inside the panel so a requested item can fill it.
  const expenseForm = useExpenseForm()

  // Completing item names off the inventory, shared with the expense form.
  const names = useMemo(() => data.ingredients.map(i => i.name), [data.ingredients])
  const stockOf = useMemo(() => {
    const byName = new Map<string, string>()
    for (const i of data.ingredients) if (!byName.has(i.name.trim())) byName.set(i.name.trim(), `${i.stockQty}${i.unit}`)
    return byName
  }, [data.ingredients])
  const stockHint = useCallback((name: string) => stockOf.get(name) ?? '', [stockOf])

  const load = reload

  const send = async (r: Request) => {
    try { await client.saveRequest(r); await reload(); toast('Request sent to admin') }
    catch { toast('Could not send (no connection)', 'warn'); throw new Error('not sent') }
  }
  const toggle = async (r: Request) => { try { await client.saveRequest({ ...r, done: !r.done }); await reload() } catch { toast('No connection', 'warn') } }
  const remove = async (r: Request) => { try { await client.deleteRequest(r.id); await reload() } catch { toast('No connection', 'warn') } }

  /**
   * Starts an expense for one requested item.
   *
   * The dialog closes on the way, because the form it fills sits behind it —
   * leaving it open would make a click that did plenty look like it did nothing.
   * It also makes plain that the form holds one expense at a time: clicking a
   * second item replaces the first rather than adding to it.
   */
  const raiseExpense = (item: RequestItem) => {
    const estimate = estimateCost(item.text, data.priceList)
    expenseForm.fromRequest(expenseDescriptionFor(item), estimate)
    setViewing(null)
    toast(estimate != null ? `Started an expense, about ${formatQar(estimate)}` : 'Started an expense - add the amount')
  }

  /** The price sheet's figure for a line, blank when it cannot say. */
  const priced = (line: string) => {
    const estimate = estimateCost(line, data.priceList)
    return estimate != null ? `~${formatQar(estimate)}` : ''
  }

  if (purchasing) return <PurchaseScreen data={data} refresh={refresh} onClose={() => setPurchasing(false)} />

  const openReqs = requests.filter(r => !r.done)
  // Only requests picked item by item can be added up; older free-text ones are read by eye.
  const listable = (r: Request) => !!r.lines?.some(l => outstanding(l) > 0)
  const onList = openReqs.filter(r => listable(r) && !leftOut.has(r.id))
  const toBuy = shoppingList(onList)

  if (receiving) {
    return (
      <PurchaseScreen
        data={data}
        refresh={refresh}
        onClose={() => setReceiving(false)}
        receiving={{
          items: toBuy,
          onReceived: async got => {
            const { updated, notes } = receive(onList, got)
            for (const r of updated) await client.saveRequest(r)
            await reload()
            return notes
          },
        }}
      />
    )
  }
  const doneReqs = requests.filter(r => r.done)
  /** One requested item per line — see requestLines for why the raw text can't be printed as-is. */
  const lines = (r: Request, done: boolean) => r.lines ? (
    <div style={{ display: 'grid', gap: 3 }}>
      {CAFES.filter(c => r.lines!.some(l => l.branch === c)).map(c => (
        <div key={c} style={{ display: 'grid', gap: 3 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--muted)' }}>{CAFE_LABEL[c]}</div>
          {r.lines!.filter(l => l.branch === c).map(l => (
            <div key={l.id} style={{ fontWeight: 600, textDecoration: done || outstanding(l) === 0 ? 'line-through' : 'none' }}>
              {l.name} {formatQty(l.qty, l.unit, l.unitLabel)}
              {!done && !!l.received && outstanding(l) > 0 && <span style={{ color: '#B54708', fontWeight: 600 }}> · {formatQty(outstanding(l), l.unit, l.unitLabel)} still to buy</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : (
    <div style={{ display: 'grid', gap: 3 }}>
      {requestLines(r.message).map((line, i) => (
        <div key={i} style={{ fontWeight: 600, textDecoration: done ? 'line-through' : 'none' }}>{line}</div>
      ))}
    </div>
  )

  const row = (r: Request) => (
    <div key={r.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
      {!r.done && listable(r) && (
        <input
          type="checkbox"
          checked={!leftOut.has(r.id)}
          onChange={e => setLeftOut(s => { const next = new Set(s); if (e.target.checked) next.delete(r.id); else next.add(r.id); return next })}
          aria-label={`Add ${r.from ? `${r.from}'s` : 'this'} request to the shopping list`}
          title="On the shopping list"
          style={{ width: 22, height: 22, marginTop: 2, accentColor: '#1A1A1A', flexShrink: 0 }}
        />
      )}
      <button
        onClick={() => setViewing(r)}
        title="Open this request"
        style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', opacity: r.done ? 0.55 : 1 }}
      >
        {lines(r, !!r.done)}
        <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>{r.from ? `${r.from} · ` : ''}{new Date(r.timestamp).toLocaleString()}</div>
      </button>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => toggle(r)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 700 }}>{r.done ? 'Reopen' : 'Mark done'}</button>
        <button onClick={() => remove(r)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 1180 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Requests</h2>
        <button onClick={load} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 14px', fontWeight: 700 }}>Refresh</button>
      </div>

      {/* Requests on the left, expenses on the right — asking for stock and
          recording what was paid for it are the same errand. auto-fit drops to a
          single column on a narrow screen rather than squeezing both. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
        <RequestForm ingredients={data.ingredients} onSend={send} />

        <Card title={`Open requests (${openReqs.length})${loading ? ' · loading…' : ''}`} padding={0}
          actions={openReqs.some(listable) && <span style={{ color: 'var(--muted)', fontSize: 13 }}>Tick to add to the shopping list</span>}>
          {!loading && openReqs.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No open requests.</div>}
          {openReqs.map(row)}
        </Card>

        {doneReqs.length > 0 && (
          <Card title={`Done (${doneReqs.length})`} padding={0}>
            {doneReqs.map(row)}
          </Card>
        )}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <ShoppingListCard items={toBuy} ingredients={data.ingredients} onReceive={() => setReceiving(true)} />
          <PurchasesCard data={data} refresh={refresh} onAdd={() => setPurchasing(true)} onChanged={() => setExpensesVersion(v => v + 1)} />
          <ExpensesPanel key={expensesVersion} state={expenseForm} names={names} hint={stockHint} />
        </div>
      </div>

      <Modal open={!!viewing} title="Request" onClose={() => setViewing(null)}>
        {viewing && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ color: 'var(--muted)' }}>
              {viewing.from ? <>From <strong style={{ color: 'var(--ink)' }}>{viewing.from}</strong> · </> : null}
              {new Date(viewing.timestamp).toLocaleString()} ·{' '}
              <strong style={{ color: viewing.done ? 'var(--muted)' : 'var(--ink)' }}>{viewing.done ? 'Done' : 'Open'}</strong>
            </div>

            {viewing.lines ? (
              <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: '10px 14px' }}>{lines(viewing, !!viewing.done)}</div>
            ) : (<>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Tap an item to start an expense for it.</div>

            <div style={{ display: 'grid', gap: 0, border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden' }}>
              {requestItems(viewing.message).map((item, i) =>
                // Headings ("Audi Cafe") group the list; they are not things to
                // buy, so they read as labels and cannot be clicked.
                item.heading ? (
                  <div
                    key={i}
                    style={{
                      padding: '10px 14px', fontSize: 13, fontWeight: 800, letterSpacing: 0.4,
                      textTransform: 'uppercase', color: 'var(--muted)', background: '#f7f7f7',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                    }}
                  >
                    {item.text}
                  </div>
                ) : (
                  <button
                    key={i}
                    onClick={() => raiseExpense(item)}
                    title={`Add an expense for ${item.text}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left', font: 'inherit', cursor: 'pointer',
                      padding: '10px 14px', fontSize: 15, border: 'none',
                      borderTop: i === 0 ? 'none' : '1px solid var(--line)',
                      background: '#fff',
                      textDecoration: viewing.done ? 'line-through' : 'none',
                    }}
                  >
                    <span>{item.text}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 12, textDecoration: 'none', flexShrink: 0 }}>
                      {[branchLabel(item.branch), priced(item.text)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ),
              )}
            </div>
            </>)}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => { await toggle(viewing); setViewing(null) }}
                style={{ flex: 1, background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}
              >
                {viewing.done ? 'Reopen' : 'Mark done'}
              </button>
              <button
                onClick={async () => { await remove(viewing); setViewing(null) }}
                style={{ border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
