import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order, DeletionLog } from '../../db/schema'
import { DataTable, type Column } from '../../components/DataTable'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { exportXlsx } from '../../domain/xlsx'
import { formatQar } from '../../domain/money'

const DELETE_PASSWORD = 'admin'

export function OrdersLogScreen({ data }: { data: Data }) {
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
  const confirmDelete = async () => {
    if (password !== DELETE_PASSWORD) { toast('Wrong password', 'warn'); return }
    if (!reason.trim()) { toast('A reason is required', 'warn'); return }
    const order = deleting!
    const log: DeletionLog = { id: crypto.randomUUID(), timestamp: Date.now(), reason: reason.trim(), order }
    await repo.put('deletionLogs', log)
    await repo.remove('orders', order.id)
    setOrders(os => os.filter(o => o.id !== order.id))
    closeDelete(); toast('Order deleted and logged')
  }

  const cols: Column<Order>[] = [
    { key: 'time', header: 'Time', render: o => new Date(o.timestamp).toLocaleString() },
    { key: 'staff', header: 'Person', render: o => staffName(o) },
    { key: 'dept', header: 'Department', render: o => deptName(o) },
    { key: 'items', header: 'Items', render: o => itemsText(o) },
    { key: 'total', header: 'Total', render: o => formatQar(o.total) },
    { key: 'actions', header: '', render: o => <button onClick={() => setDeleting(o)} style={{ border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', borderRadius: 8, padding: '6px 12px' }}>Delete</button> },
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
      time: new Date(o.timestamp).toLocaleString(), person: staffName(o), department: deptName(o),
      items: itemsText(o), total: o.total,
    })),
    { totals: { time: 'TOTAL', person: '', department: '', items: `${filtered.length} order(s)`, total: filtered.reduce((s, o) => s + o.total, 0) } },
  )
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ margin: 0 }}>Orders Log</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input value={person} onChange={e => setPerson(e.target.value)} placeholder="Search person…" style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)', minWidth: 200 }} />
          <select value={dept} onChange={e => setDept(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}>
            <option value="">All departments</option>
            {data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={exportXls} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Export Excel</button>
        </div>
      </div>
      <div style={{ color: 'var(--muted)' }}>
        {person.trim() || dept ? <>Showing <strong>{filtered.length}</strong> order(s) · <strong>{formatQar(filteredTotal)}</strong></> : <>{filtered.length} order(s) · {formatQar(filteredTotal)} total</>}
      </div>
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 12 }}><DataTable columns={cols} rows={filtered} /></div>

      <Modal open={!!deleting} title="Delete order" onClose={closeDelete}>
        {deleting && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--muted)' }}>
              {new Date(deleting.timestamp).toLocaleString()} · {staffName(deleting)} · {formatQar(deleting.total)}<br />
              {deleting.lines.map(l => `${l.qty}× ${l.name}`).join(', ')}
            </div>
            <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Admin password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)' }} />
            </label>
            <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Reason for deletion
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why is this order being deleted?" style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontFamily: 'inherit' }} />
            </label>
            <button onClick={confirmDelete} style={{ background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}>Delete order</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
