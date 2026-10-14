import { useMemo, useState, type ReactNode } from 'react'
import type { Data } from '../../app/useData'
import type { Order, PaymentMethod, Staff } from '../../db/schema'
import { repo } from '../../db/repo'
import { placeOrder } from './placeOrder'
import { useToast } from '../../components/Toast'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { formatQar } from '../../domain/money'
import { milkPair } from '../../domain/milk'
import { paymentLabel } from '../../domain/payment'
import {
  STAFF_DISCOUNT, columnOf, hostByExtension, staffByMobile, staffOnExtension, toPlaceOrderInput, totalWith,
  type OnlineOrder, type OnlineStatus,
} from '../../domain/online'
import { onlineClient } from '../../sync/online'
import { OnlineHistory } from './OnlineHistory'

const CAFE = { volkswagen: 'VW Cafe', audi: 'Audi Cafe' } as const
const STATE: Record<OnlineStatus, string> = { pending: 'New', accepted: 'Making', onway: 'Out for delivery', delivered: 'Delivered', rejected: 'Rejected' }
const REASONS = ['That item is sold out', "We're closing soon", "We're too busy right now"]
const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Orders from qautocafe.vercel.app. New ones ring and wait here until someone
 * accepts them; accepting places them as normal orders (stock, billing, finance).
 */
export function OnlineOrders({ data, orders, reload, onPlaced }: { data: Data; orders: OnlineOrder[]; reload: () => Promise<void>; onPlaced: () => void }) {
  const toast = useToast()
  // What the barista has set on a card before accepting it.
  const [hosts, setHosts] = useState<Record<string, string>>({})
  const [discounts, setDiscounts] = useState<Record<string, number>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [rejecting, setRejecting] = useState<OnlineOrder | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<'board' | 'history'>('board')
  const milk = useMemo(() => milkPair(data.ingredients), [data.ingredients])
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'

  const hostOf = (o: OnlineOrder): Staff | null => {
    if (o.data.who !== 'guest') return null
    const picked = hosts[o.id] ?? o.data.hostStaffId
    return picked ? data.staff.find(s => s.id === picked) ?? null : hostByExtension(o.data.ext ?? '', data.staff)
  }
  const discountOf = (o: OnlineOrder) => o.status === 'pending' ? discounts[o.id] ?? o.data.discountPct : o.data.discountPct

  // Every move goes through here: another tablet may have got there first.
  const move = async (o: OnlineOrder, to: OnlineStatus, patch: Partial<OnlineOrder['data']>, after?: () => Promise<void>) => {
    setBusy(o.id)
    try {
      const moved = await onlineClient.move(o, to, { ...o.data, ...patch })
      if (!moved) { toast(`#${o.data.no} was already updated on another screen`, 'warn'); return }
      await after?.()
      setOpen(m => { const n = { ...m }; delete n[o.id]; return n })
    } catch {
      toast('No connection. Nothing was changed, try again.', 'warn')
    } finally {
      setBusy(null)
      await reload()
    }
  }

  const accept = (o: OnlineOrder) => {
    const host = hostOf(o)
    const discountPct = discountOf(o)
    const orderId = crypto.randomUUID()
    return move(o, 'accepted', { hostStaffId: host?.id, discountPct, total: totalWith(o, discountPct), orderId }, async () => {
      await placeOrder({ ...toPlaceOrderInput(o, { host, staff: data.staff, menuItems: data.menuItems, milk, discountPct }), id: orderId })
      const person = o.data.who === 'retail' ? staffByMobile(o.data.mobile ?? '', data.staff)?.name ?? o.data.name : null
      toast(`#${o.data.no} accepted${person ? ` · walk-in sale under ${person}` : ''}${discountPct ? ` with ${discountPct}% off` : ''}`)
      onPlaced()
    })
  }

  // The customer may pay differently from what they picked; the order follows what happened.
  const paid = (o: OnlineOrder, method: PaymentMethod) => move(o, 'delivered', { paidBy: method }, async () => {
    const placed = o.data.orderId ? await repo.get<Order>('orders', o.data.orderId) : undefined
    if (placed && placed.paymentMethod !== method) { await repo.put('orders', { ...placed, paymentMethod: method }); onPlaced() }
    toast(`#${o.data.no} delivered, paid by ${paymentLabel(method).toLowerCase()}`)
  })

  const cols = { new: [] as OnlineOrder[], making: [] as OnlineOrder[], done: [] as OnlineOrder[] }
  for (const o of orders) cols[columnOf(o.status)].push(o)

  const card = (o: OnlineOrder) => {
    const d = o.data
    const guest = d.who === 'guest'
    const pct = discountOf(o)
    const total = totalWith(o, pct)
    const host = hostOf(o)
    const isOpen = open[o.id] ?? columnOf(o.status) !== 'done'
    const head = (
      <button
        onClick={() => setOpen(m => ({ ...m, [o.id]: !isOpen }))}
        aria-expanded={isOpen}
        className="flex w-full min-h-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent px-4 pt-3.5 pb-1.5 text-left hover:bg-footer"
      >
        <b className="text-base font-semibold tabular-nums">#{d.no}</b>
        <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
        <span className="font-semibold whitespace-nowrap tabular-nums">{guest ? 'Complimentary' : formatQar(total)}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
    )
    if (!isOpen) {
      return (
        <div key={o.id} className="grid overflow-hidden rounded-card bg-card shadow-card">
          {head}
          <div className="flex items-center justify-between gap-2 px-4 pb-3 text-xs text-muted-foreground">
            <span>{time(o.createdAt)} · {CAFE[d.branch]}</span>
            <Badge variant={o.status === 'rejected' ? 'danger' : o.status === 'delivered' ? 'success' : 'neutral'}>
              {STATE[o.status]}{d.paidBy ? ` · ${paymentLabel(d.paidBy)}` : ''}
            </Badge>
          </div>
        </div>
      )
    }

    const onExt = guest ? staffOnExtension(d.ext ?? '', data.staff) : []
    const auto = guest && onExt.length === 1
    const choices = onExt.length > 1 ? onExt : data.staff.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name))
    const person = !guest ? staffByMobile(d.mobile ?? '', data.staff) : null

    let match: ReactNode
    if (!guest) {
      // Still a walk-in sale; the match only decides the name it is saved under.
      match = person
        ? <div className="mx-4 mb-2.5 rounded-control bg-success-soft px-3 py-2.5 text-sm text-success">✓ <b>{person.name}</b> · {deptName(person.departmentId)}</div>
        : <div className="mx-4 mb-2.5 text-xs text-muted-foreground">Not in the directory. Saved as “{d.name}”.</div>
    } else if (o.status !== 'pending') {
      match = host ? <div className="mx-4 mb-2.5 text-xs text-muted-foreground">Billed to <b className="font-medium text-foreground">{deptName(host.departmentId)}</b> · Guest of {host.name}</div> : null
    } else if (auto && !hosts[o.id]) {
      match = <div className="mx-4 mb-2.5 rounded-control bg-success-soft px-3 py-2.5 text-sm text-success">✓ Ext {d.ext}: <b>{onExt[0].name}</b> · {deptName(onExt[0].departmentId)}</div>
    } else {
      match = (
        <label className="mx-4 mb-2.5 grid gap-2 rounded-control bg-warning-soft px-3 py-2.5 text-sm text-warning">
          <span>{onExt.length > 1 ? `Ext ${d.ext} is shared by ${onExt.length} people.` : `Ext ${d.ext} isn't in the staff directory.`} Choose who they're visiting:</span>
          <select
            value={host?.id ?? ''}
            onChange={e => setHosts(h => ({ ...h, [o.id]: e.target.value }))}
            aria-label="Choose host"
            className="h-9 w-full rounded-lg border border-border bg-card px-2 text-foreground"
          >
            <option value="">Choose host…</option>
            {choices.map(s => <option key={s.id} value={s.id}>{s.name} · {deptName(s.departmentId)}</option>)}
          </select>
        </label>
      )
    }

    const off = busy === o.id
    let acts: ReactNode
    if (o.status === 'pending') {
      acts = <>
        <Button size="sm" variant={pct ? 'default' : 'outline'} aria-pressed={!!pct} onClick={() => setDiscounts(m => ({ ...m, [o.id]: pct ? 0 : STAFF_DISCOUNT }))}>15% Off</Button>
        <Button size="sm" variant="outline" className="text-destructive" disabled={off} onClick={() => setRejecting(o)}>Reject</Button>
        <Button size="sm" disabled={off || (guest && !host)} onClick={() => accept(o)}>Accept</Button>
      </>
    } else if (o.status === 'accepted') {
      acts = <Button size="sm" disabled={off} onClick={() => move(o, 'onway', {})}>Out for delivery</Button>
    } else if (o.status === 'onway') {
      const said = d.pay ?? 'card'
      acts = guest
        ? <Button size="sm" disabled={off} onClick={() => move(o, 'delivered', {})}>Delivered</Button>
        : <>{[said, said === 'card' ? 'cash' : 'card'].map(m => (
          <Button key={m} size="sm" variant={m === said ? 'default' : 'outline'} disabled={off} onClick={() => paid(o, m as PaymentMethod)}>Paid {m}</Button>
        ))}</>
    } else {
      acts = <Badge variant={o.status === 'rejected' ? 'danger' : 'success'}>{STATE[o.status]}{d.paidBy ? ` · ${paymentLabel(d.paidBy)}` : ''}</Badge>
    }

    return (
      <div key={o.id} className={`grid overflow-hidden rounded-card bg-card ${o.status === 'pending' ? 'shadow-[0_0_0_2px_var(--color-primary)]' : 'shadow-card'}`}>
        {head}
        <div className="grid gap-1.5 px-4 pb-2.5">
          <small className="text-xs text-muted-foreground">{time(o.createdAt)}</small>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{CAFE[d.branch]}</Badge>
            {guest ? <Badge variant="success">Q-Auto’s guest</Badge> : <Badge variant="warning">Staff (retail) · {paymentLabel(d.pay)}</Badge>}
          </div>
          <div className="grid gap-0.5 text-sm">
            <b className="font-semibold">{d.name}</b>
            <small className="text-xs text-muted-foreground">{guest ? `Visiting ext ${d.ext}` : `+974 ${(d.mobile ?? '').slice(0, 4)} ${(d.mobile ?? '').slice(4)}`}</small>
          </div>
          <div className="text-sm">Deliver to: <b className="font-medium">{d.deliverTo}</b></div>
          {d.note && <div className="text-sm text-muted-foreground">“{d.note}”</div>}
        </div>
        {match}
        <ul className="m-0 grid list-none gap-1.5 border-t border-divider px-4 py-2">
          {d.lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-2 text-sm">
              <span className="flex min-w-0 flex-wrap items-center gap-1.5">{l.qty} × {l.name}{l.milk === 'lactose-free' && <Badge variant="neutral">LACTOSE FREE</Badge>}</span>
              <span className="whitespace-nowrap tabular-nums">{formatQar(round2(l.qty * l.unitPrice))}</span>
            </li>
          ))}
          {pct > 0 && (
            <li className="flex justify-between gap-2 text-sm text-muted-foreground">
              <span>Staff discount ({pct}%)</span><span className="whitespace-nowrap tabular-nums">−{formatQar(round2(d.subtotal - total))}</span>
            </li>
          )}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider bg-footer px-4 py-2.5">
          <span className="flex flex-wrap items-center gap-1.5 font-semibold whitespace-nowrap tabular-nums">
            {pct > 0 && <s className="font-normal text-muted-foreground">{formatQar(d.subtotal)}</s>}
            {formatQar(total)}
            {guest && <Badge variant="success">Complimentary</Badge>}
          </span>
          <span className="flex flex-wrap gap-2">{acts}</span>
        </div>
      </div>
    )
  }

  const col = (title: string, list: OnlineOrder[], empty: string, count?: boolean) => (
    <div className="grid min-w-0 content-start gap-2.5">
      <h3 className="m-0 flex items-center gap-2 text-sm font-semibold">{title}{count && list.length > 0 && <Badge variant="solid" className="tabular-nums">{list.length}</Badge>}</h3>
      {list.length ? list.map(card) : <div className="rounded-card border border-dashed border-border-strong px-3.5 py-5 text-center text-sm text-muted-foreground">{empty}</div>}
    </div>
  )

  return (
    <div className="grid h-full content-start gap-4 overflow-auto bg-[#f9fafb] p-4 font-sans text-foreground">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-xl font-semibold tracking-tight">Online orders</h2>
          <p className="m-0 text-sm text-muted-foreground">{tab === 'board' ? 'New orders ring and wait here until someone accepts them.' : 'Every online order, and what they add up to.'}</p>
        </div>
        <div className="flex gap-0.5 rounded-control bg-muted p-[3px]" role="tablist">
          {(['board', 'history'] as const).map(t => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-8 cursor-pointer rounded-md border-0 px-3.5 font-sans text-sm font-medium ${tab === t ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.1)]' : 'bg-transparent text-muted-foreground'}`}>
              {t === 'board' ? 'Today' : 'History'}
            </button>
          ))}
        </div>
      </div>
      {tab === 'history' && <OnlineHistory />}
      {tab === 'board' && rejecting && (
        <div role="dialog" aria-label="Reject order" className="grid overflow-hidden rounded-card bg-card shadow-card">
          <div className="grid gap-1.5 px-4 py-3.5">
            <b className="font-semibold">Reject #{rejecting.data.no}?</b>
            <span className="text-xs text-muted-foreground">The customer sees the reason on their phone.</span>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map(r => (
                <Button key={r} size="sm" variant="outline" onClick={() => { const o = rejecting; setRejecting(null); void move(o, 'rejected', { reason: r }, async () => toast(`#${o.data.no} rejected`)) }}>{r}</Button>
              ))}
            </div>
          </div>
          <div className="flex justify-end border-t border-divider bg-footer px-4 py-2.5">
            <Button size="sm" variant="outline" onClick={() => setRejecting(null)}>Keep order</Button>
          </div>
        </div>
      )}
      {tab === 'board' && <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-3">
        {col('New', cols.new, 'No new orders.', true)}
        {col('Making and delivering', cols.making, 'Accepted orders show here.')}
        {col('Done today', cols.done, 'Delivered and rejected orders.')}
      </div>}
    </div>
  )
}
