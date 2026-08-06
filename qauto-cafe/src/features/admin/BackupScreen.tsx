import { useEffect, useRef, useState } from 'react'
import type { Data } from '../../app/useData'
import { exportAll, importAll, type Backup } from '../../db/backup'
import { repo } from '../../db/repo'
import type { DeletionLog } from '../../db/schema'
import { downloadText } from '../../domain/csv'
import { formatQar } from '../../domain/money'
import { client } from '../../sync/client'
import { emailBackup } from '../../sync/emailBackup'
import { isConfigured } from '../../sync/config'
import { Modal } from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { Card } from '../../components/Card'

interface CloudBackup { id: string; created_at: number; payload: { kind?: string; periodKey?: string; exportedAt?: number; version?: number; data?: Record<string, unknown[]> } }

export function BackupScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const [backups, setBackups] = useState<CloudBackup[]>([])
  const [logs, setLogs] = useState<DeletionLog[]>([])
  const [viewing, setViewing] = useState<CloudBackup | null>(null)
  const [loadingList, setLoadingList] = useState(false)

  const loadList = async () => {
    setLoadingList(true)
    try { if (isConfigured()) setBackups(await client.listBackups()) } catch { /* offline */ } finally { setLoadingList(false) }
  }
  const loadLogs = async () => setLogs((await repo.all<DeletionLog>('deletionLogs')).sort((a, b) => b.timestamp - a.timestamp))
  useEffect(() => { loadList(); loadLogs() }, [])

  const doExport = async () => {
    const dump = await exportAll()
    downloadText(`qauto-cafe-backup-${new Date(dump.exportedAt).toISOString().slice(0, 10)}.json`, JSON.stringify(dump), 'application/json')
  }
  const doImport = async (file: File) => { await importAll(JSON.parse(await file.text()) as Backup); await refresh(); toast('Backup restored') }
  const saveToCloud = async () => {
    const dump = await exportAll()
    const backup = { kind: 'manual', periodKey: `manual-${dump.exportedAt}`, exportedAt: dump.exportedAt, version: dump.version, data: dump.data }
    await client.insertBackup(backup)
    await emailBackup(backup)
    toast('Backup saved to cloud'); await loadList()
  }
  const loadCloud = async (b: CloudBackup) => {
    if (!b.payload?.data) { toast('This backup has no data', 'warn'); return }
    if (!confirm('Restore this backup? It REPLACES all current data on this device.')) return
    await importAll({ version: b.payload.version ?? 0, exportedAt: b.payload.exportedAt ?? b.created_at, data: b.payload.data })
    await refresh(); toast('Backup restored')
  }
  const countLine = (d?: Record<string, unknown[]>) => d ? Object.entries(d).map(([k, v]) => `${k}: ${v.length}`).join(' · ') : '—'
  const staffName = (o: DeletionLog['order']) => o.walkin ? (o.customerName ? `Walk-in · ${o.customerName}` : 'Walk-in') : (data.staff.find(s => s.id === o.staffId)?.name ?? '—')

  return (
    <div style={{ display: 'grid', gap: 20, maxWidth: 760 }}>
      <h2 style={{ margin: 0 }}>Backup & Restore</h2>

      <Card title="Manual backup">
        <div style={{ display: 'grid', gap: 10 }}>
          <p style={{ color: 'var(--muted)', margin: 0 }}>Restoring replaces ALL current data on this device.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={doExport} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}>Download backup (.json)</button>
            <button onClick={() => fileRef.current?.click()} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}>Restore from file…</button>
            <button onClick={saveToCloud} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 10, padding: '12px 16px', fontWeight: 700 }}>Save backup to cloud now</button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
        </div>
      </Card>

      <Card
        title="Cloud backups"
        padding={0}
        actions={<span style={{ color: 'var(--muted)', fontSize: 13 }}>Auto: daily 10pm · monthly · {loadingList ? 'loading…' : `${backups.length} saved`}</span>}
      >
        {backups.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No cloud backups yet.</div>}
        {backups.map(b => (
          <div key={b.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span>
              <strong style={{ textTransform: 'capitalize' }}>{b.payload?.kind ?? 'backup'}</strong> · {new Date(b.created_at).toLocaleString()}
            </span>
            <span style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setViewing(b)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 12px' }}>View</button>
              <button onClick={() => loadCloud(b)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 12px', fontWeight: 700 }}>Load</button>
            </span>
          </div>
        ))}
      </Card>

      <Card title="Deleted logs" padding={0}>
        <p style={{ color: 'var(--muted)', margin: '0 24px 16px' }}>Orders removed by an admin, with reason. Not included in any export.</p>
        {logs.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>No deletions logged.</div>}
        {logs.map(l => (
          <div key={l.id} className="card-row">
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>{staffName(l.order)} · {formatQar(l.order.total)}</strong>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>deleted {new Date(l.timestamp).toLocaleString()}</span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>
              Order from {new Date(l.order.timestamp).toLocaleString()} · {l.order.lines.map(li => `${li.qty}× ${li.name}`).join(', ')}
            </div>
            <div style={{ marginTop: 2 }}>Reason: {l.reason}</div>
          </div>
        ))}
      </Card>

      <Modal open={!!viewing} title="Backup contents" onClose={() => setViewing(null)}>
        {viewing && (
          <div style={{ display: 'grid', gap: 10 }}>
            <div><strong style={{ textTransform: 'capitalize' }}>{viewing.payload?.kind ?? 'backup'}</strong> · {new Date(viewing.created_at).toLocaleString()}</div>
            <div style={{ color: 'var(--muted)' }}>{countLine(viewing.payload?.data)}</div>
            <button onClick={() => downloadText(`backup-${new Date(viewing.created_at).toISOString().slice(0, 10)}.json`, JSON.stringify({ version: viewing.payload?.version, exportedAt: viewing.payload?.exportedAt, data: viewing.payload?.data }), 'application/json')}
              style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 10, padding: 12, fontWeight: 700 }}>Download as .json</button>
            <button onClick={() => { setViewing(null); loadCloud(viewing) }} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: 12, fontWeight: 800 }}>Load this backup</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
