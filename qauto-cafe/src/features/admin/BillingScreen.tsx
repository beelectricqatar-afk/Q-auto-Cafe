import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { aggregateBilling } from '../../domain/billing'
import { formatQar } from '../../domain/money'
import { exportXlsx } from '../../domain/xlsx'
import { periodRange, PERIOD_LABELS, type PeriodKey } from '../../domain/dateRanges'

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
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Billing</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Search person or walk-in…" style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)', minWidth: 200 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(k => (
              <button key={k} onClick={() => setPeriod(k)} style={{ padding: '8px 14px', borderRadius: 8, fontWeight: 700,
                border: period === k ? 'none' : '1px solid var(--line)', background: period === k ? '#1A1A1A' : '#fff', color: period === k ? '#fff' : 'var(--ink)' }}>
                {PERIOD_LABELS[k]}
              </button>
            ))}
          </div>
          <strong>Total: {formatQar(round2(deptTotal + walkinTotal))}</strong>
          <button onClick={() => exportStatement(`billing-${period}.xlsx`, `Departments ${formatQar(deptTotal)} · Walk-in ${formatQar(walkinTotal)}`, [...orders].filter(o => o.timestamp >= range.from && o.timestamp < range.to))} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Export Excel</button>
        </div>
      </div>

      {/* Departments */}
      <div style={{ color: 'var(--muted)', fontWeight: 700 }}>Departments — {formatQar(deptTotal)}</div>
      {shownDepts.length === 0 && <div style={{ color: 'var(--muted)' }}>No matching department orders.</div>}
      {shownDepts.map(d => (
        <details key={d.departmentId ?? 'none'} open={!!q} style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 14, border: '1px solid var(--line)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            <span>{deptName(d.departmentId)} · {d.orderCount} order(s)</span><span>{formatQar(d.total)}</span>
          </summary>
          <div style={{ marginTop: 10, display: 'grid', gap: 6 }}>
            {d.byPerson.map(p => (
              <div key={p.staffId ?? 'w'} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'var(--muted)' }}>{staffName(p.staffId)} ({p.orderCount})</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span>{formatQar(p.total)}</span>
                  <button onClick={() => staffStatement(d.departmentId, p.staffId, staffName(p.staffId))} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 13 }}>Statement</button>
                </span>
              </div>
            ))}
          </div>
        </details>
      ))}

      {/* Walk-in customers */}
      <div style={{ color: 'var(--muted)', fontWeight: 700, marginTop: 6 }}>Walk-in customers — {formatQar(walkinTotal)}</div>
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 14, border: '1px solid var(--line)', display: 'grid', gap: 6 }}>
        {walkinGroups.length === 0 && <span style={{ color: 'var(--muted)' }}>No matching walk-in orders.</span>}
        {walkinGroups.map(g => (
          <div key={g.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--line)', paddingBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>{g.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({g.orderCount})</span></span>
            <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span>{formatQar(g.total)}</span>
              <button onClick={() => walkinStatement(g.name)} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '4px 10px', fontWeight: 700, fontSize: 13 }}>Statement</button>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
