import { useCallback, useMemo, useState } from 'react'
import type { Request } from '../../db/schema'
import type { Data } from '../../app/useData'
import { client } from '../../sync/client'
import { useToast } from '../../components/Toast'
import { formatQar } from '../../domain/money'
import { Card } from '../../components/Card'
import { Modal } from '../../components/Modal'
import { TypeAhead } from '../../components/TypeAhead'
import { TrashIcon } from './sidebarIcons'
import { expenseDescriptionFor, requestItems, requestLines, type RequestItem } from '../../domain/requests'
import { branchLabel } from '../../domain/branch'
import { estimateCost } from '../../domain/estimateCost'
import { ExpensesPanel } from './ExpensesPanel'
import { useExpenseForm } from './useExpenseForm'
import type { RequestsState } from './useRequests'

// Requests live directly in the shared cloud (the `meta` table), so every
// device sees the same list. The list itself is held by the admin shell so the
// sidebar badge and this screen cannot disagree.
export function RequestsScreen({ data, state }: { data: Data; state: RequestsState }) {
  const { requests, loading, reload } = state
  const [from, setFrom] = useState('')
  const [message, setMessage] = useState('')
  const [viewing, setViewing] = useState<Request | null>(null)
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

  const send = async () => {
    if (!message.trim()) { toast('Type a request first', 'warn'); return }
    const r: Request = { id: crypto.randomUUID(), timestamp: Date.now(), message: message.trim(), from: from.trim() || undefined, done: false }
    try { await client.saveRequest(r); setMessage(''); await reload(); toast('Request sent to admin') }
    catch { toast('Could not send (no connection)', 'warn') }
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

  const openReqs = requests.filter(r => !r.done)
  const doneReqs = requests.filter(r => r.done)
  /** One requested item per line — see requestLines for why the raw text can't be printed as-is. */
  const lines = (r: Request, done: boolean) => (
    <div style={{ display: 'grid', gap: 3 }}>
      {requestLines(r.message).map((line, i) => (
        <div key={i} style={{ fontWeight: 600, textDecoration: done ? 'line-through' : 'none' }}>{line}</div>
      ))}
    </div>
  )

  const row = (r: Request) => (
    <div key={r.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
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
        {/* Card clips to its rounded corners by default, which would cut off the
            suggestion list hanging below the textarea. */}
        <Card title="Send a request to the admin" style={{ overflow: 'visible' }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Your name (optional)" style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 16 }} />
            <TypeAhead
              value={message}
              onChange={setMessage}
              names={names}
              hint={stockHint}
              rows={3}
              label="Request"
              placeholder="e.g. We need more oranges, 5kg"
              style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 16 }}
            />
            <button onClick={send} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 16 }}>Send request</button>
          </div>
        </Card>

        <Card title={`Open requests (${openReqs.length})${loading ? ' · loading…' : ''}`} padding={0}>
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
          <ExpensesPanel state={expenseForm} names={names} hint={stockHint} />
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
