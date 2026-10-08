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
import { Button } from '../../components/ui/button'
import { Checkbox } from '../../components/ui/checkbox'
import { useConfirm } from '../../components/ui/confirm-dialog'
import { cn } from '../../lib/utils'
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
  const { confirm, dialog } = useConfirm()
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
  const remove = async (r: Request) => {
    if (!await confirm({ title: r.from ? `Delete ${r.from}'s request?` : 'Delete this request?', description: 'It disappears from every device. Use Mark done instead if it was handled.' })) return false
    try { await client.deleteRequest(r.id); await reload() } catch { toast('No connection', 'warn') }
    return true
  }

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
    <div className="grid gap-1">
      {CAFES.filter(c => r.lines!.some(l => l.branch === c)).map(c => (
        <div key={c} className="grid gap-1">
          <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{CAFE_LABEL[c]}</div>
          {r.lines!.filter(l => l.branch === c).map(l => (
            <div key={l.id} className={cn('font-medium', (done || outstanding(l) === 0) && 'line-through')}>
              {l.name} {formatQty(l.qty, l.unit, l.unitLabel)}
              {!done && !!l.received && outstanding(l) > 0 && <span className="font-semibold text-warning"> · {formatQty(outstanding(l), l.unit, l.unitLabel)} still to buy</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  ) : (
    <div className="grid gap-1">
      {requestLines(r.message).map((line, i) => (
        <div key={i} className={cn('font-medium', done && 'line-through')}>{line}</div>
      ))}
    </div>
  )

  const row = (r: Request) => (
    <div key={r.id} className="card-row flex items-start justify-between gap-3">
      {!r.done && listable(r) && (
        <Checkbox
          checked={!leftOut.has(r.id)}
          onChange={e => setLeftOut(s => { const next = new Set(s); if (e.target.checked) next.delete(r.id); else next.add(r.id); return next })}
          aria-label={`Add ${r.from ? `${r.from}'s` : 'this'} request to the shopping list`}
          title="On the shopping list"
          className="mt-0.5"
        />
      )}
      <button
        onClick={() => setViewing(r)}
        title="Open this request"
        className={cn('min-h-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left font-sans text-sm text-foreground', r.done && 'opacity-55')}
      >
        {lines(r, !!r.done)}
        <div className="mt-1 text-xs text-muted-foreground">{r.from ? `${r.from} · ` : ''}{new Date(r.timestamp).toLocaleString()}</div>
      </button>
      <div className="flex shrink-0 gap-1.5">
        <Button variant="outline" size="sm" onClick={() => toggle(r)}>{r.done ? 'Reopen' : 'Mark done'}</Button>
        <button onClick={() => remove(r)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
      </div>
    </div>
  )

  return (
    <div className="grid max-w-[1180px] gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 text-2xl font-medium">Requests</h2>
        <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
      </div>

      {/* Requests on the left, expenses on the right — asking for stock and
          recording what was paid for it are the same errand. auto-fit drops to a
          single column on a narrow screen rather than squeezing both. */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start gap-4">
        <div className="grid gap-4">
        <RequestForm ingredients={data.ingredients} onSend={send} />

        <Card title={`Open requests (${openReqs.length})${loading ? ' · loading…' : ''}`} padding={0}
          actions={openReqs.some(listable) && <span className="text-xs text-muted-foreground">Tick to add to the shopping list</span>}>
          {!loading && openReqs.length === 0 && <div className="card-row text-muted-foreground">No open requests.</div>}
          {openReqs.map(row)}
        </Card>

        {doneReqs.length > 0 && (
          <Card title={`Done (${doneReqs.length})`} padding={0}>
            {doneReqs.map(row)}
          </Card>
        )}
        </div>

        <div className="grid gap-4">
          <ShoppingListCard items={toBuy} ingredients={data.ingredients} onReceive={() => setReceiving(true)} />
          <PurchasesCard data={data} refresh={refresh} onAdd={() => setPurchasing(true)} onChanged={() => setExpensesVersion(v => v + 1)} />
          <ExpensesPanel key={expensesVersion} state={expenseForm} names={names} hint={stockHint} />
        </div>
      </div>

      <Modal open={!!viewing} title="Request" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              {viewing.from ? <>From <strong className="font-semibold text-foreground">{viewing.from}</strong> · </> : null}
              {new Date(viewing.timestamp).toLocaleString()} ·{' '}
              <strong className={cn('font-semibold', viewing.done ? 'text-muted-foreground' : 'text-foreground')}>{viewing.done ? 'Done' : 'Open'}</strong>
            </div>

            {viewing.lines ? (
              <div className="rounded-control border border-border px-4 py-3">{lines(viewing, !!viewing.done)}</div>
            ) : (<>
            <div className="text-xs text-muted-foreground">Tap an item to start an expense for it.</div>

            <div className="grid overflow-hidden rounded-control border border-border">
              {requestItems(viewing.message).map((item, i) =>
                // Headings ("Audi Cafe") group the list; they are not things to
                // buy, so they read as labels and cannot be clicked.
                item.heading ? (
                  <div
                    key={i}
                    className={cn('bg-[#FAFAFA] px-4 py-2.5 text-xs font-semibold tracking-wider text-muted-foreground uppercase', i > 0 && 'border-t border-divider')}
                  >
                    {item.text}
                  </div>
                ) : (
                  <button
                    key={i}
                    onClick={() => raiseExpense(item)}
                    title={`Add an expense for ${item.text}`}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border-0 bg-card px-4 text-left font-sans text-sm text-foreground hover:bg-[#FAFAFA]',
                      i > 0 && 'border-t border-divider',
                      viewing.done && 'line-through',
                    )}
                  >
                    <span>{item.text}</span>
                    <span className="shrink-0 text-xs text-muted-foreground no-underline">
                      {[branchLabel(item.branch), priced(item.text)].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                ),
              )}
            </div>
            </>)}

            <div className="flex gap-2">
              <Button className="flex-1" onClick={async () => { await toggle(viewing); setViewing(null) }}>
                {viewing.done ? 'Reopen' : 'Mark done'}
              </Button>
              <Button variant="outline" className="border-[#FDA29B] text-destructive hover:bg-destructive-soft" onClick={async () => { if (await remove(viewing)) setViewing(null) }}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </Modal>
      {dialog}
    </div>
  )
}
