import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Order } from '../../db/schema'
import { repo } from '../../db/repo'
import { Badge } from '../../components/ui/badge'
import { Input, Select } from '../../components/ui/input'
import { DataTable, type Column } from '../../components/DataTable'
import { formatQar } from '../../domain/money'
import { paymentLabel } from '../../domain/payment'
import { onlineStats, type OnlineOrder } from '../../domain/online'
import { onlineClient } from '../../sync/online'

const CAFE = { volkswagen: 'VW Cafe', audi: 'Audi Cafe' } as const
const STATUS = { pending: 'New', accepted: 'Making', onway: 'Out for delivery', delivered: 'Delivered', rejected: 'Rejected' } as const
const DAY = 86400000
const dayStart = (ms: number) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime() }
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const fromYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime() }
const pct = (n: number, of: number) => of ? `${Math.round(n / of * 100)}%` : '—'
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`

type Range = 'today' | 'yesterday' | 'week' | 'month' | 'custom'
const RANGES: [Range, string][] = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'Last 7 days'], ['month', 'This month'], ['custom', 'Pick dates']]

function rangeOf(r: Range, from: string, to: string): [number, number] {
  const today = dayStart(Date.now())
  if (r === 'yesterday') return [today - DAY, today]
  if (r === 'week') return [today - 6 * DAY, today + DAY]
  if (r === 'month') { const d = new Date(today); return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), today + DAY] }
  if (r === 'custom') return [fromYmd(from), fromYmd(to) + DAY]
  return [today, today + DAY]
}

const Box = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
  <div className={`grid content-start gap-3 rounded-card bg-card p-4 shadow-card ${className}`}>
    <h3 className="m-0 text-sm font-semibold">{title}</h3>
    {children}
  </div>
)
const Stat = ({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) => (
  <div className="grid content-start gap-1 rounded-card bg-card p-4 shadow-card">
    <span className="text-sm text-muted-foreground">{label}</span>
    <b className="text-2xl font-semibold tracking-tight tabular-nums">{value}</b>
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
)
/** A labelled bar, its length relative to the biggest in the list. */
const Bar = ({ name, n, max, tail }: { name: string; n: number; max: number; tail?: string }) => (
  <div className="grid gap-1">
    <div className="flex justify-between gap-2 text-sm"><span className="truncate">{name}</span><span className="tabular-nums text-muted-foreground">{tail ?? n}</span></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${max ? n / max * 100 : 0}%` }} /></div>
  </div>
)
const Split = ({ a, b }: { a: [string, number]; b: [string, number] }) => {
  const all = a[1] + b[1]
  return (
    <div className="grid gap-1.5">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {all > 0 && <div className="bg-primary" style={{ width: `${a[1] / all * 100}%` }} />}
      </div>
      <div className="flex justify-between text-sm"><span>{a[0]} <b className="font-semibold tabular-nums">{a[1]}</b></span><span className="text-muted-foreground">{b[0]} <b className="font-semibold text-foreground tabular-nums">{b[1]}</b></span></div>
    </div>
  )
}

/** Past online orders and what they add up to. For looking at, not for the PDF reports. */
export function OnlineHistory() {
  const [range, setRange] = useState<Range>('week')
  const [from, setFrom] = useState(() => ymd(Date.now() - 6 * DAY))
  const [to, setTo] = useState(() => ymd(Date.now()))
  const [cafe, setCafe] = useState('')
  const [who, setWho] = useState('')
  const [search, setSearch] = useState('')
  const [list, setList] = useState<OnlineOrder[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [counterOrders, setCounterOrders] = useState<Order[]>([])
  const [start, end] = rangeOf(range, from, to)

  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      setList(null); setFailed(false)
      onlineClient.history(start, end).then(l => { if (live) setList(l) }, () => { if (live) { setFailed(true); setList([]) } })
      repo.all('orders').then(os => { if (live) setCounterOrders(os.filter(o => o.timestamp >= start && o.timestamp < end)) })
    }, 0)
    return () => { live = false; clearTimeout(t) }
  }, [start, end])

  const shown = useMemo(() => (list ?? []).filter(o =>
    (!cafe || o.data.branch === cafe) && (!who || o.data.who === who) &&
    (!search.trim() || o.data.name.toLowerCase().includes(search.trim().toLowerCase()) || String(o.data.no) === search.trim().replace('#', ''))
  ), [list, cafe, who, search])
  const s = useMemo(() => onlineStats(shown), [shown])
  const allOrders = counterOrders.filter(o => !cafe || o.branch === cafe).length
  const fromOnline = counterOrders.filter(o => o.onlineOrderId && (!cafe || o.branch === cafe)).length
  const hours = s.byHour.map((n, h) => ({ h, n })).filter(({ h, n }) => n > 0 || (h >= 7 && h <= 17))
  const maxHour = Math.max(1, ...s.byHour)

  const cols: Column<OnlineOrder>[] = [
    { key: 'no', header: '#', render: o => <b className="font-semibold">#{o.data.no}</b> },
    { key: 'time', header: 'Placed', render: o => new Date(o.createdAt).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) },
    { key: 'cafe', header: 'Cafe', render: o => CAFE[o.data.branch] },
    { key: 'name', header: 'Name', render: o => o.data.name },
    { key: 'who', header: 'Type', render: o => o.data.who === 'guest' ? <Badge variant="success">Guest</Badge> : <Badge variant="warning">Staff</Badge> },
    { key: 'items', header: 'Items', render: o => o.data.lines.map(l => `${l.qty}× ${l.name.trim()}`).join(', ') },
    { key: 'total', header: 'Total', render: o => o.data.who === 'guest' ? 'Complimentary' : formatQar(o.data.total) },
    { key: 'status', header: 'Status', render: o => (
      <span className="grid justify-items-start gap-0.5">
        <Badge variant={o.status === 'rejected' ? 'danger' : o.status === 'delivered' ? 'success' : 'neutral'}>{STATUS[o.status]}{o.data.paidBy ? ` · ${paymentLabel(o.data.paidBy)}` : ''}</Badge>
        {o.data.reason && <small className="text-xs text-muted-foreground">{o.data.reason}</small>}
      </span>
    ) },
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {RANGES.map(([r, label]) => (
            <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
              className={`h-8 cursor-pointer rounded-full border px-3 font-sans text-sm ${range === r ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted'}`}>
              {label}
            </button>
          ))}
        </div>
        {range === 'custom' && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className="w-40" aria-label="From" />
            to
            <Input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} className="w-40" aria-label="To" />
          </span>
        )}
        <span className="flex-1" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or #…" className="w-48" />
        <Select value={cafe} onChange={e => setCafe(e.target.value)} aria-label="Cafe" className="w-auto">
          <option value="">Both cafes</option><option value="volkswagen">VW Cafe</option><option value="audi">Audi Cafe</option>
        </Select>
        <Select value={who} onChange={e => setWho(e.target.value)} aria-label="Type" className="w-auto">
          <option value="">Guests and staff</option><option value="guest">Guests only</option><option value="retail">Staff only</option>
        </Select>
      </div>

      {failed && <div className="rounded-card bg-warning-soft px-4 py-3 text-sm text-warning">Couldn't load online orders. Check the connection and try again.</div>}
      {list === null ? <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div> : (<>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Online orders" value={s.orders} sub={allOrders ? <>{pct(fromOnline, allOrders)} of all {allOrders} orders in this period</> : 'No orders in this period'} />
          <Stat label="Staff sales" value={formatQar(s.sales)} sub={`${s.card} card · ${s.cash} cash`} />
          <Stat label="Complimentary (guests)" value={formatQar(s.complimentary)} sub={`${s.guests - shown.filter(o => o.data.who === 'guest' && o.status === 'rejected').length} guest order(s), billed to departments`} />
          <Stat label="Rejected" value={s.rejected} sub={s.orders ? `${pct(s.rejected, s.orders)} of online orders` : '—'} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <Box title="Top online drinks">
            {s.topDrinks.length ? s.topDrinks.slice(0, 6).map(d => <Bar key={d.name} name={d.name} n={d.n} max={s.topDrinks[0].n} />) : <span className="text-sm text-muted-foreground">No drinks yet.</span>}
          </Box>
          <Box title="Busiest hours">
            <div className="flex items-end gap-1">
              {hours.map(({ h, n }) => (
                <div key={h} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${hourLabel(h)}: ${n} order(s)`}>
                  {n > 0 && <span className="text-[10px] tabular-nums text-muted-foreground">{n}</span>}
                  <div className={`w-full rounded-t ${n ? 'bg-primary' : 'bg-muted'}`} style={{ height: Math.max(4, Math.round(n / maxHour * 96)) }} />
                  <span className="text-[10px] text-muted-foreground">{hourLabel(h)}</span>
                </div>
              ))}
            </div>
          </Box>
          <Box title="Who orders">
            <Split a={['VW Cafe', s.byCafe.volkswagen]} b={['Audi Cafe', s.byCafe.audi]} />
            <Split a={['Staff', s.staff]} b={['Guests', s.guests]} />
            <Split a={['Card', s.card]} b={['Cash', s.cash]} />
          </Box>
          <Box title="How fast we are">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-0.5"><span className="text-xs text-muted-foreground">Order → accepted</span><b className="text-xl font-semibold tabular-nums">{s.minsToAccept === null ? '—' : `${s.minsToAccept} min`}</b></div>
              <div className="grid gap-0.5"><span className="text-xs text-muted-foreground">Order → delivered</span><b className="text-xl font-semibold tabular-nums">{s.minsToDeliver === null ? '—' : `${s.minsToDeliver} min`}</b></div>
            </div>
            <span className="text-xs text-muted-foreground">Average, from orders handled after this was added.</span>
          </Box>
          <Box title="Why orders were rejected" className="lg:col-span-2">
            {s.reasons.length ? s.reasons.map(r => <Bar key={r.name} name={r.name} n={r.n} max={s.reasons[0].n} />) : <span className="text-sm text-muted-foreground">Nothing rejected in this period.</span>}
          </Box>
        </div>

        <div className="grid gap-2">
          <h3 className="m-0 text-sm font-semibold">{shown.length} online order{shown.length === 1 ? '' : 's'}</h3>
          <div className="rounded-card bg-card p-3 shadow-card">
            {shown.length ? <DataTable columns={cols} rows={shown} /> : <div className="py-8 text-center text-sm text-muted-foreground">No online orders in this period.</div>}
          </div>
        </div>
      </>)}
    </div>
  )
}
