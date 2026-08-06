import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Request } from '../../db/schema'
import type { Data } from '../../app/useData'
import { client } from '../../sync/client'
import { isConfigured } from '../../sync/config'
import { useToast } from '../../components/Toast'
import { Card } from '../../components/Card'
import { TrashIcon } from './sidebarIcons'
import { matchNames, replaceWordAt, wordAt } from '../../domain/search'

// Requests live directly in the shared cloud (the `meta` table), so every
// device sees the same list — read live on load, written straight up.
export function RequestsScreen({ data }: { data: Data }) {
  const [requests, setRequests] = useState<Request[]>([])
  const [from, setFrom] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  // Type-ahead over the inventory: completes the word under the caret so a
  // request can be written without spelling out every item in full.
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const stockOf = useMemo(() => {
    const byName = new Map<string, string>()
    for (const i of data.ingredients) if (!byName.has(i.name.trim())) byName.set(i.name.trim(), `${i.stockQty}${i.unit}`)
    return byName
  }, [data.ingredients])

  const suggestions = useMemo(
    () => dismissed ? [] : matchNames(wordAt(message, caret).word, data.ingredients.map(i => i.name)),
    [dismissed, message, caret, data.ingredients],
  )

  // Once the completed text is on screen, move the real caret to match.
  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at == null) return
    pendingCaret.current = null
    boxRef.current?.focus()
    boxRef.current?.setSelectionRange(at, at)
  }, [message])

  const accept = (name: string) => {
    const next = replaceWordAt(message, caret, name)
    pendingCaret.current = next.caret
    setMessage(next.text)
    setCaret(next.caret)
    setHighlight(0)
    // The completed name would otherwise match itself and reopen the list.
    setDismissed(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(suggestions[highlight]) }
    else if (e.key === 'Escape') { e.preventDefault(); setDismissed(true) }
  }

  const syncCaret = (el: HTMLTextAreaElement) => setCaret(el.selectionStart ?? el.value.length)

  const load = async () => {
    setLoading(true)
    try { if (isConfigured()) setRequests((await client.listRequests()).sort((a, b) => b.timestamp - a.timestamp)) }
    catch { toast('Could not load requests (no connection)', 'warn') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const send = async () => {
    if (!message.trim()) { toast('Type a request first', 'warn'); return }
    const r: Request = { id: crypto.randomUUID(), timestamp: Date.now(), message: message.trim(), from: from.trim() || undefined, done: false }
    try { await client.saveRequest(r); setMessage(''); await load(); toast('Request sent to admin') }
    catch { toast('Could not send (no connection)', 'warn') }
  }
  const toggle = async (r: Request) => { try { await client.saveRequest({ ...r, done: !r.done }); await load() } catch { toast('No connection', 'warn') } }
  const remove = async (r: Request) => { try { await client.deleteRequest(r.id); await load() } catch { toast('No connection', 'warn') } }

  const openReqs = requests.filter(r => !r.done)
  const doneReqs = requests.filter(r => r.done)
  const row = (r: Request) => (
    <div key={r.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ opacity: r.done ? 0.55 : 1 }}>
        <div style={{ fontWeight: 600, textDecoration: r.done ? 'line-through' : 'none' }}>{r.message}</div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{r.from ? `${r.from} · ` : ''}{new Date(r.timestamp).toLocaleString()}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button onClick={() => toggle(r)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 700 }}>{r.done ? 'Reopen' : 'Mark done'}</button>
        <button onClick={() => remove(r)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 760 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Requests</h2>
        <button onClick={load} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 14px', fontWeight: 700 }}>Refresh</button>
      </div>

      {/* Card clips to its rounded corners by default, which would cut off the
          suggestion list hanging below the textarea. */}
      <Card title="Send a request to the admin" style={{ overflow: 'visible' }}>
        <div style={{ display: 'grid', gap: 10 }}>
          <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Your name (optional)" style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 16 }} />
          <div style={{ position: 'relative' }}>
            <textarea
              ref={boxRef}
              value={message}
              onChange={e => { setMessage(e.target.value); setDismissed(false); setHighlight(0); syncCaret(e.target) }}
              onKeyUp={e => syncCaret(e.currentTarget)}
              onClick={e => syncCaret(e.currentTarget)}
              onBlur={() => setTimeout(() => setDismissed(true), 120)}
              onKeyDown={onKeyDown}
              rows={3}
              placeholder="e.g. We need more oranges, 5kg"
              style={{ width: '100%', boxSizing: 'border-box', padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit', fontSize: 16 }}
            />
            {suggestions.length > 0 && (
              <div
                role="listbox"
                aria-label="Inventory suggestions"
                style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflowY: 'auto', maxHeight: 260 }}
              >
                {suggestions.map((name, i) => (
                  <button
                    key={name}
                    role="option"
                    aria-selected={i === highlight}
                    // The textarea's blur would close the list before the click lands.
                    onMouseDown={e => { e.preventDefault(); accept(name) }}
                    onMouseEnter={() => setHighlight(i)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', padding: '9px 12px', fontSize: 15, cursor: 'pointer', background: i === highlight ? '#f2f2f2' : '#fff' }}
                  >
                    <span>{name}</span>
                    <span style={{ color: 'var(--muted)', fontSize: 13 }}>{stockOf.get(name) ?? ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
  )
}
