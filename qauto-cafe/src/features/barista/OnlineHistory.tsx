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

// Each total has its own colour: the chart blue, then the app's green, violet and red.
const TONES = {
  blue: { chip: 'bg-[#EEF1FF] text-[#465FFF]', bar: 'bg-[#465FFF]' },
  green: { chip: 'bg-success-soft text-success', bar: 'bg-success' },
  violet: { chip: 'bg-[#F4F3FF] text-[#6941C6]', bar: 'bg-[#7A5AF8]' },
  red: { chip: 'bg-destructive-soft text-destructive', bar: 'bg-destructive' },
} as const
const ICONS = {
  phone: <path d="M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zm3 17h2" />,
  cash: <path d="M3 7h18v10H3zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 10v4m12-4v4" />,
  gift: <path d="M4 11h16v9H4zM3 7h18v4H3zm9 0v13M12 7c-1.5-3-5-3-5-1s5 1 5 1zm0 0c1.5-3 5-3 5-1s-5 1-5 1z" />,
  cross: <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6m0-6l-6 6" />,
}
const Stat = ({ label, value, sub, tone, icon }: { label: string; value: ReactNode; sub?: ReactNode; tone: keyof typeof TONES; icon: keyof typeof ICONS }) => (
  <div className="relative grid content-start gap-1 overflow-hidden rounded-card bg-card p-4 shadow-card">
    <span className={`absolute inset-x-0 top-0 h-1 ${TONES[tone].bar}`} />
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`grid size-8 place-items-center rounded-lg ${TONES[tone].chip}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[icon]}</svg>
      </span>
    </div>
    <b className="text-2xl font-semibold tracking-tight tabular-nums">{value}</b>
    {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
  </div>
)
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
          <Stat tone="blue" icon="phone" label="Online orders" value={s.orders} sub={allOrders ? <>{pct(fromOnline, allOrders)} of all {allOrders} orders in this period</> : 'No orders in this period'} />
          <Stat tone="green" icon="cash" label="Staff sales" value={formatQar(s.sales)} sub={`${s.card} card · ${s.cash} cash`} />
          <Stat tone="violet" icon="gift" label="Complimentary (guests)" value={formatQar(s.complimentary)} sub={`${s.guestOrders} guest order(s), billed to departments`} />
          <Stat tone="red" icon="cross" label="Rejected" value={s.rejected} sub={s.orders ? `${pct(s.rejected, s.orders)} of online orders` : '—'} />
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
