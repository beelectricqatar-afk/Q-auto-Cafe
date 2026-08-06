import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { formatQar } from '../../domain/money'
import { periodRange, PERIOD_LABELS, type PeriodKey } from '../../domain/dateRanges'
import { ordersInRange, revenue, avgOrderValue, walkinCount, topItems, topDepartments, peakHour } from '../../domain/analytics'
import { Card } from '../../components/Card'
import { MetricCard } from '../../components/MetricCard'
import { OrdersIcon, DollarIcon, DirectoryIcon, ClockIcon, InventoryIcon } from './sidebarIcons'

export function Dashboard({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [period, setPeriod] = useState<PeriodKey>('today')
  useEffect(() => { repo.all('orders').then(setOrders) }, [])

  const range = useMemo(() => periodRange(period), [period])
  const inRange = useMemo(() => ordersInRange(orders, range.from, range.to), [orders, range])
  const walkinRevenue = useMemo(() => revenue(inRange.filter(o => o.walkin)), [inRange])
  const deptRevenue = useMemo(() => revenue(inRange.filter(o => !o.walkin)), [inRange])
  const items = useMemo(() => topItems(inRange), [inRange])
  const depts = useMemo(() => topDepartments(inRange, data.departments), [inRange, data.departments])
  const low = data.ingredients.filter(i => i.stockQty <= i.lowStockThreshold)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Dashboard</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {(Object.keys(PERIOD_LABELS) as PeriodKey[]).map(k => (
            <button key={k} onClick={() => setPeriod(k)} style={{ padding: '8px 14px', borderRadius: 8, fontWeight: 700,
              border: period === k ? 'none' : '1px solid #e5e5e5', background: period === k ? '#1A1A1A' : '#fff', color: period === k ? '#fff' : 'var(--ink)' }}>
              {PERIOD_LABELS[k]}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: 'auto', gap: 16 }}>
        <MetricCard style={{ gridColumn: '1', gridRow: '1' }} icon={OrdersIcon} label={`Orders · ${range.label.toLowerCase()}`} value={String(inRange.length)} />
        <MetricCard style={{ gridColumn: '2', gridRow: '1' }} icon={DollarIcon} label="Avg order value" value={formatQar(avgOrderValue(inRange))} />
        <MetricCard style={{ gridColumn: '3', gridRow: '1' }} icon={DirectoryIcon} label="Walk-ins" value={String(walkinCount(inRange))} />

        <div className="card-hoverable dark" style={{ gridColumn: '4', gridRow: '1 / span 2', background: '#1A1A1A', border: '1px solid #1A1A1A', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.12)', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
            <DollarIcon className="metric-card-icon" />
          </div>
          <div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>Revenue · {range.label.toLowerCase()}</div>
            <div style={{ fontSize: 30, fontWeight: 700, lineHeight: '38px', color: '#fff', marginBottom: 8 }}>{formatQar(revenue(inRange))}</div>
            <div style={{ display: 'grid', gap: 8, fontSize: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: 'rgba(255,255,255,0.65)' }}>Departments</span><strong style={{ whiteSpace: 'nowrap', color: '#fff' }}>{formatQar(deptRevenue)}</strong></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: 'rgba(255,255,255,0.65)' }}>Walk-in</span><strong style={{ whiteSpace: 'nowrap', color: '#fff' }}>{formatQar(walkinRevenue)}</strong></div>
            </div>
          </div>
        </div>

        <MetricCard style={{ gridColumn: '1', gridRow: '2' }} icon={InventoryIcon} label="Low-stock items" value={String(low.length)} tone={low.length > 0 ? 'bad' : 'normal'} />
        <MetricCard style={{ gridColumn: '2 / span 2', gridRow: '2' }} icon={ClockIcon} label="Peak hour" value={peakHour(inRange) ?? '—'} />

        <div style={{ gridColumn: '1 / span 2', gridRow: '3' }}>
          <Card hoverable title={`Top items · ${range.label.toLowerCase()}`}>
            <div style={{ display: 'grid', gap: 6 }}>
              {items.length === 0 && <span style={{ color: 'var(--muted)' }}>No orders yet</span>}
              {items.map((it, i) => (
                <div key={it.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{i + 1}. {it.name} <span style={{ color: 'var(--muted)' }}>×{it.qty}</span></span>
                  <strong>{formatQar(it.revenue)}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div style={{ gridColumn: '3 / span 2', gridRow: '3' }}>
          <Card hoverable title={`Top departments · ${range.label.toLowerCase()}`}>
            <div style={{ display: 'grid', gap: 6 }}>
              {depts.length === 0 && <span style={{ color: 'var(--muted)' }}>No orders yet</span>}
              {depts.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{i + 1}. {d.name} <span style={{ color: 'var(--muted)' }}>({d.orderCount})</span></span>
                  <strong>{formatQar(d.total)}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {low.length > 0 && (
        <div style={{ background: '#fff8e6', border: '1px solid #f0c36a', borderRadius: 16, padding: 24 }}>
          <strong>Low stock:</strong> {low.map(i => `${i.name} (${i.stockQty}${i.unit})`).join(', ')}
        </div>
      )}
    </div>
  )
}
