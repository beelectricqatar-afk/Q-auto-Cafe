import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { aggregateBilling } from '../../domain/billing'
import { formatQar } from '../../domain/money'
import { exportXlsx } from '../../domain/xlsx'
import { periodRange, PERIOD_LABELS, type PeriodKey } from '../../domain/dateRanges'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { ToggleGroup } from '../../components/ui/toggle-group'

const round2 = (n: number) => Math.round(n * 100) / 100
const STMT_COLS = [
  { header: 'Date', key: 'date', width: 22 },
  { header: 'Items', key: 'items', width: 60 },
  { header: 'Total (QAR)', key: 'total', width: 14, money: true },
]

export function BillingScreen({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [period, setPeriod] = useState<PeriodKey>('month')
  const [person, setPerson] = useState('')
  useEffect(() => { repo.all('orders').then(setOrders) }, [])
  const range = useMemo(() => periodRange(period), [period])
  const q = person.trim().toLowerCase()

  const deptName = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? 'Unassigned'
  const staffName = (id: string | null) => data.staff.find(s => s.id === id)?.name ?? 'Whole dept'
  const itemsText = (o: Order) => o.lines.map(l => `${l.qty}× ${l.name}`).join(', ') + (o.discountPct ? ` · ${o.discountPct}% off` : '')

  // Department billing covers non-walk-in orders only; walk-ins get their own section.
  const report = useMemo(() => aggregateBilling(orders.filter(o => !o.walkin), range), [orders, range])
  const walkinInRange = useMemo(() => orders.filter(o => o.walkin && o.timestamp >= range.from && o.timestamp < range.to), [orders, range])

  const shownDepts = useMemo(() => report.departments.map(d => {
    const byPerson = q ? d.byPerson.filter(p => staffName(p.staffId).toLowerCase().includes(q)) : d.byPerson
    return { ...d, byPerson, total: round2(byPerson.reduce((s, p) => s + p.total, 0)), orderCount: byPerson.reduce((s, p) => s + p.orderCount, 0) }
  }).filter(d => d.byPerson.length > 0), [report, q]) // eslint-disable-line react-hooks/exhaustive-deps

  const walkinGroups = useMemo(() => {
    const m = new Map<string, { name: string; total: number; orderCount: number }>()
    for (const o of walkinInRange) {
      const name = o.customerName?.trim() || '(no name)'
      const g = m.get(name) ?? { name, total: 0, orderCount: 0 }
      g.total = round2(g.total + o.total); g.orderCount++
      m.set(name, g)
    }
    const all = [...m.values()].sort((a, b) => b.total - a.total)
    return q ? all.filter(g => g.name.toLowerCase().includes(q)) : all
  }, [walkinInRange, q])

  const deptTotal = round2(shownDepts.reduce((s, d) => s + d.total, 0))
  const walkinTotal = round2(walkinGroups.reduce((s, g) => s + g.total, 0))

  const exportStatement = (filename: string, title: string, rows: Order[]) => exportXlsx(
    filename, 'Statement', STMT_COLS,
    rows.slice().sort((a, b) => a.timestamp - b.timestamp).map(o => ({ date: new Date(o.timestamp).toLocaleString(), items: itemsText(o), total: o.total })),
    { totals: { date: title, items: '', total: round2(rows.reduce((s, o) => s + o.total, 0)) } },
  )
  const staffStatement = (departmentId: string | null, staffId: string | null, name: string) =>
    exportStatement(`statement-${name.replace(/\s+/g, '-')}-${period}.xlsx`, `${name} · ${range.label} · `,
      orders.filter(o => !o.walkin && o.timestamp >= range.from && o.timestamp < range.to && o.staffId === staffId && o.departmentId === departmentId))
  const walkinStatement = (name: string) =>
    exportStatement(`statement-walkin-${name.replace(/\s+/g, '-')}-${period}.xlsx`, `Walk-in: ${name} · ${range.label} · `,
      walkinInRange.filter(o => (o.customerName?.trim() || '(no name)') === name))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl font-medium">Billing</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Input value={person} onChange={e => setPerson(e.target.value)} placeholder="Search person or walk-in…" className="w-60" />
          <ToggleGroup
            label="Period"
            value={period}
            onChange={setPeriod}
            options={(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(k => ({ value: k, label: PERIOD_LABELS[k] }))}
          />
          <strong className="font-semibold tabular-nums">Total: {formatQar(round2(deptTotal + walkinTotal))}</strong>
          <Button onClick={() => exportStatement(`billing-${period}.xlsx`, `Departments ${formatQar(deptTotal)} · Walk-in ${formatQar(walkinTotal)}`, [...orders].filter(o => o.timestamp >= range.from && o.timestamp < range.to))}>Export Excel</Button>
        </div>
      </div>

      {/* Departments */}
      <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Departments — {formatQar(deptTotal)}</div>
      {shownDepts.length === 0 && <div className="text-sm text-muted-foreground">No matching department orders.</div>}
      {shownDepts.map(d => (
        <details key={d.departmentId ?? 'none'} open={!!q} className="rounded-card bg-card px-7 py-5 shadow-card">
          <summary className="flex cursor-pointer justify-between gap-3 font-semibold">
            <span>{deptName(d.departmentId)} · {d.orderCount} order(s)</span><span className="tabular-nums">{formatQar(d.total)}</span>
          </summary>
          <div className="mt-3 grid gap-2">
            {d.byPerson.map(p => (
              <div key={p.staffId ?? 'w'} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{staffName(p.staffId)} ({p.orderCount})</span>
                <span className="flex items-center gap-2.5">
                  <span className="tabular-nums">{formatQar(p.total)}</span>
                  <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => staffStatement(d.departmentId, p.staffId, staffName(p.staffId))}>Statement</Button>
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}

      {/* Walk-in customers */}
      <div className="mt-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">Walk-in customers — {formatQar(walkinTotal)}</div>
      <div className="grid rounded-card bg-card shadow-card">
        {walkinGroups.length === 0 && <span className="card-row text-muted-foreground">No matching walk-in orders.</span>}
        {walkinGroups.map(g => (
          <div key={g.name} className="card-row flex items-center justify-between gap-2 text-sm">
            <span className="font-semibold">{g.name} <span className="font-normal text-muted-foreground">({g.orderCount})</span></span>
            <span className="flex items-center gap-2.5">
              <span className="tabular-nums">{formatQar(g.total)}</span>
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => walkinStatement(g.name)}>Statement</Button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
