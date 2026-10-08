import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { exportXlsx } from '../../domain/xlsx'
import { formatQar } from '../../domain/money'
import { deleteOrder, type DeleteDisposition } from './deleteOrder'
import { branchLabel } from '../../domain/branch'
import { paymentLabel } from '../../domain/payment'
import { Button } from '../../components/ui/button'
import { Input, Select, Textarea } from '../../components/ui/input'
import { Card } from '../../components/Card'

const DELETE_PASSWORD = 'admin'

export function OrdersLogScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [dept, setDept] = useState('')
  const [person, setPerson] = useState('')
  const [deleting, setDeleting] = useState<Order | null>(null)
  const [password, setPassword] = useState('')
  const [reason, setReason] = useState('')
  const toast = useToast()
  useEffect(() => { repo.all('orders').then(o => setOrders(o.sort((a, b) => b.timestamp - a.timestamp))) }, [])
  const deptName = (o: Order) => o.walkin ? '—' : (data.departments.find(d => d.id === o.departmentId)?.name ?? '—')
  const staffName = (o: Order) => o.walkin ? (o.customerName ? `Walk-in · ${o.customerName}` : 'Walk-in') : (data.staff.find(s => s.id === o.staffId)?.name ?? '—')
  const filtered = useMemo(() => orders.filter(o =>
    (!dept || o.departmentId === dept) &&
    (!person.trim() || staffName(o).toLowerCase().includes(person.trim().toLowerCase()))
  ), [orders, dept, person])
  const filteredTotal = useMemo(() => Math.round(filtered.reduce((s, o) => s + o.total, 0) * 100) / 100, [filtered])
  const itemsText = (o: Order) => o.lines.map(l => `${l.qty}× ${l.name}`).join(', ') + (o.discountPct ? ` · ${o.discountPct}% off` : '')

  const closeDelete = () => { setDeleting(null); setPassword(''); setReason('') }
  const confirmDelete = async (disposition: DeleteDisposition) => {
    if (password !== DELETE_PASSWORD) { toast('Wrong password', 'warn'); return }
    if (!reason.trim()) { toast('A reason is required', 'warn'); return }
    const order = deleting!
    const { restored, wastedQar } = await deleteOrder({ order, reason: reason.trim(), disposition })
    setOrders(os => os.filter(o => o.id !== order.id))
    closeDelete()
    toast(disposition === 'restock'
      ? `Order deleted · ${Object.keys(restored).length} ingredient(s) returned to stock`
      : `Order deleted · ${formatQar(wastedQar)} booked as wastage`)
    await refresh()
  }

  const cols: Column<Order>[] = [
    { key: 'time', header: 'Time', render: o => new Date(o.timestamp).toLocaleString() },
    { key: 'branch', header: 'Cafe', render: o => branchLabel(o.branch) || '—' },
    { key: 'staff', header: 'Person', render: o => staffName(o) },
    { key: 'dept', header: 'Department', render: o => deptName(o) },
    { key: 'items', header: 'Items', render: o => itemsText(o) },
    { key: 'paid', header: 'Paid', render: o => paymentLabel(o.paymentMethod) || '—' },
    { key: 'total', header: 'Total', render: o => formatQar(o.total) },
    { key: 'actions', header: '', render: o => <Button variant="outline" size="sm" className="border-[#FDA29B] text-destructive hover:bg-destructive-soft" onClick={() => setDeleting(o)}>Delete</Button> },
  ]
  const exportXls = () => exportXlsx(
    'orders.xlsx', 'Orders',
    [
      { header: 'Time', key: 'time', width: 22 },
      { header: 'Person', key: 'person', width: 26 },
      { header: 'Department', key: 'department', width: 30 },
      { header: 'Items', key: 'items', width: 48 },
      { header: 'Total (QAR)', key: 'total', width: 14, money: true },
    ],
    filtered.map(o => ({
      time: new Date(o.timestamp).toLocaleString(), cafe: branchLabel(o.branch), person: staffName(o), department: deptName(o),
      items: itemsText(o), total: o.total,
    })),
    { totals: { time: 'TOTAL', cafe: '', person: '', department: '', items: `${filtered.length} order(s)`, total: filtered.reduce((s, o) => s + o.total, 0) } },
  )
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-2xl font-semibold tracking-tight">Orders Log</h2>
        <div className="flex flex-wrap gap-2">
          <Input value={person} onChange={e => setPerson(e.target.value)} placeholder="Search person…" className="w-56" />
          <Select value={dept} onChange={e => setDept(e.target.value)} aria-label="Department" className="w-auto">
            <option value="">All departments</option>
            {data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Button onClick={exportXls}>Export Excel</Button>
        </div>
      </div>
      <div className="text-sm text-muted-foreground">
        {person.trim() || dept ? <>Showing <strong className="font-semibold text-foreground">{filtered.length}</strong> order(s) · <strong className="font-semibold text-foreground">{formatQar(filteredTotal)}</strong></> : <>{filtered.length} order(s) · {formatQar(filteredTotal)} total</>}
      </div>
      <Card padding={12}><DataTable columns={cols} rows={filtered} /></Card>

      <Modal open={!!deleting} title="Delete order" onClose={closeDelete}>
        {deleting && (
          <div className="grid gap-4">
            <div className="text-sm text-muted-foreground">
              {new Date(deleting.timestamp).toLocaleString()} · {staffName(deleting)} · {formatQar(deleting.total)}<br />
              {deleting.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}
            </div>
            <label className="grid gap-1.5 text-sm font-medium">Admin password
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium">Reason for deletion
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why is this order being deleted?" />
            </label>
            <div className="mt-1 text-sm font-medium">What happened to the stock?</div>
            <div className="grid grid-cols-2 gap-3">
              {([
                { key: 'restock' as const, title: 'Back to inventory', blurb: 'Never made — put the ingredients back' },
                { key: 'wastage' as const, title: 'Wastage', blurb: `Made and thrown away — book ${formatQar(deleting.total)}` },
              ]).map(opt => (
                <button
                  key={opt.key}
                  onClick={() => confirmDelete(opt.key)}
                  className="grid aspect-square cursor-pointer content-center justify-items-center gap-2 rounded-card border border-border bg-card p-4 text-center font-sans text-foreground transition-colors hover:border-foreground hover:bg-[#FAFAFA]"
                >
                  <span className="text-lg font-medium">{opt.title}</span>
                  <span className="text-xs text-muted-foreground">{opt.blurb}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
