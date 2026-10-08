import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { formatQar } from '../../domain/money'
import { defaultSelection, selectionRange, type RangeSelection } from '../../domain/rangeSelection'
import { RangePicker } from '../../components/RangePicker'
import { RevenueChart } from '../../components/RevenueChart'
import { revenueSeries } from '../../domain/revenueSeries'
import { ordersInRange, revenue, avgOrderValue, walkinCount, topItems, topDepartments, peakHour } from '../../domain/analytics'
import { Card } from '../../components/Card'
import { MetricCard } from '../../components/MetricCard'
import { OrdersIcon, DollarIcon, DirectoryIcon, ClockIcon, InventoryIcon } from './sidebarIcons'

export function Dashboard({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [selection, setSelection] = useState<RangeSelection>(() => defaultSelection('today'))
  useEffect(() => { repo.all('orders').then(setOrders) }, [])

  const range = useMemo(() => selectionRange(selection), [selection])
  const inRange = useMemo(() => ordersInRange(orders, range.from, range.to), [orders, range])
  const walkinRevenue = useMemo(() => revenue(inRange.filter(o => o.walkin)), [inRange])
  const deptRevenue = useMemo(() => revenue(inRange.filter(o => !o.walkin)), [inRange])
  // Months picked, months shown: a run of two or more reads one point per month.
  const pickedMonths = selection.mode === 'pickMonth' && (selection.toMonthKey ?? selection.monthKey) !== selection.monthKey
  const series = useMemo(
    () => revenueSeries(orders, range, undefined, pickedMonths ? 'month' : undefined).points,
    [orders, range, pickedMonths],
  )
  const items = useMemo(() => topItems(inRange), [inRange])
  const depts = useMemo(() => topDepartments(inRange, data.departments), [inRange, data.departments])
  const low = data.ingredients.filter(i => i.stockQty <= i.lowStockThreshold)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl font-semibold tracking-tight">Dashboard</h2>
        <RangePicker value={selection} onChange={setSelection} />
      </div>

      <div className="grid auto-rows-auto grid-cols-4 gap-4">
        <MetricCard style={{ gridColumn: '1', gridRow: '1' }} icon={OrdersIcon} label={`Orders · ${range.label.toLowerCase()}`} value={String(inRange.length)} />
        <MetricCard style={{ gridColumn: '2', gridRow: '1' }} icon={DollarIcon} label="Avg order value" value={formatQar(avgOrderValue(inRange))} />
        <MetricCard style={{ gridColumn: '3', gridRow: '1' }} icon={DirectoryIcon} label="Walk-ins" value={String(walkinCount(inRange))} />

        <div className="card-hoverable col-start-4 row-span-2 row-start-1 flex flex-col justify-between gap-5 rounded-card bg-primary p-6 text-primary-foreground">
          <div className="flex size-12 items-center justify-center rounded-control bg-white/12 text-white">
            <DollarIcon className="metric-card-icon" />
          </div>
          <div>
            <div className="text-sm text-white/65">Revenue · {range.label.toLowerCase()}</div>
            <div className="mb-2 text-[30px] leading-[38px] font-semibold text-white tabular-nums">{formatQar(revenue(inRange))}</div>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between gap-4"><span className="text-white/65">Departments</span><strong className="font-semibold whitespace-nowrap text-white tabular-nums">{formatQar(deptRevenue)}</strong></div>
              <div className="flex justify-between gap-4"><span className="text-white/65">Walk-in</span><strong className="font-semibold whitespace-nowrap text-white tabular-nums">{formatQar(walkinRevenue)}</strong></div>
            </div>
          </div>
        </div>

        <MetricCard style={{ gridColumn: '1', gridRow: '2' }} icon={InventoryIcon} label="Low-stock items" value={String(low.length)} tone={low.length > 0 ? 'bad' : 'normal'} />
        <MetricCard style={{ gridColumn: '2 / span 2', gridRow: '2' }} icon={ClockIcon} label="Peak hour" value={peakHour(inRange) ?? '—'} />

        <div className="col-span-4 row-start-3">
          <RevenueChart points={series} rangeLabel={range.label} />
        </div>

        <div className="col-span-2 col-start-1 row-start-4">
          <Card hoverable title={`Top items · ${range.label.toLowerCase()}`}>
            <div className="grid gap-2 text-sm">
              {items.length === 0 && <span className="text-muted-foreground">No orders yet</span>}
              {items.map((it, i) => (
                <div key={it.name} className="flex justify-between gap-3">
                  <span>{i + 1}. {it.name} <span className="text-muted-foreground">×{it.qty}</span></span>
                  <strong className="font-semibold tabular-nums">{formatQar(it.revenue)}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="col-span-2 col-start-3 row-start-4">
          <Card hoverable title={`Top departments · ${range.label.toLowerCase()}`}>
            <div className="grid gap-2 text-sm">
              {depts.length === 0 && <span className="text-muted-foreground">No orders yet</span>}
              {depts.map((d, i) => (
                <div key={d.name} className="flex justify-between gap-3">
                  <span>{i + 1}. {d.name} <span className="text-muted-foreground">({d.orderCount})</span></span>
                  <strong className="font-semibold tabular-nums">{formatQar(d.total)}</strong>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {low.length > 0 && (
        <div role="status" className="rounded-card border border-[#FEDF89] bg-warning-soft px-6 py-4 text-sm">
          <strong className="font-semibold text-warning">Low stock:</strong> {low.map(i => `${i.name} (${i.stockQty}${i.unit})`).join(', ')}
        </div>
      )}
    </div>
  )
}
