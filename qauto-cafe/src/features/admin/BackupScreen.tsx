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
import { Button } from '../../components/ui/button'

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
    <div className="grid max-w-[760px] gap-4">
      <h2 className="m-0 text-2xl font-medium">Backup & Restore</h2>

      <Card title="Manual backup">
        <div className="grid gap-3">
          <p className="m-0 text-sm text-muted-foreground">Restoring replaces ALL current data on this device.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={doExport}>Download backup (.json)</Button>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>Restore from file…</Button>
            <Button variant="outline" onClick={saveToCloud}>Save backup to cloud now</Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
        </div>
      </Card>

      <Card
        title="Cloud backups"
        padding={0}
        actions={<span className="text-xs text-muted-foreground">Auto: daily 10pm · monthly · {loadingList ? 'loading…' : `${backups.length} saved`}</span>}
      >
        {backups.length === 0 && <div className="card-row text-muted-foreground">No cloud backups yet.</div>}
        {backups.map(b => (
          <div key={b.id} className="card-row flex items-center justify-between gap-2">
            <span className="text-sm">
              <strong className="font-semibold capitalize">{b.payload?.kind ?? 'backup'}</strong> · {new Date(b.created_at).toLocaleString()}
            </span>
            <span className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setViewing(b)}>View</Button>
              <Button variant="outline" size="sm" onClick={() => loadCloud(b)}>Load</Button>
            </span>
          </div>
        ))}
      </Card>

      <Card title="Deleted logs" padding={0}>
        <p className="mx-7 mt-0 mb-4 text-sm text-muted-foreground">Orders removed by an admin, with reason. Not included in any export.</p>
        {logs.length === 0 && <div className="card-row text-muted-foreground">No deletions logged.</div>}
        {logs.map(l => (
          <div key={l.id} className="card-row grid gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <strong className="font-semibold">{staffName(l.order)} · {formatQar(l.order.total)}</strong>
              <span className="text-xs text-muted-foreground">deleted {new Date(l.timestamp).toLocaleString()}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Order from {new Date(l.order.timestamp).toLocaleString()} · {l.order.lines.map(li => `${li.qty}× ${li.name}`).join(', ')}
            </div>
            <div>Reason: {l.reason}</div>
          </div>
        ))}
      </Card>

      <Modal open={!!viewing} title="Backup contents" onClose={() => setViewing(null)}>
        {viewing && (
          <div className="grid gap-3">
            <div className="text-sm"><strong className="font-semibold capitalize">{viewing.payload?.kind ?? 'backup'}</strong> · {new Date(viewing.created_at).toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">{countLine(viewing.payload?.data)}</div>
            <Button variant="outline" onClick={() => downloadText(`backup-${new Date(viewing.created_at).toISOString().slice(0, 10)}.json`, JSON.stringify({ version: viewing.payload?.version, exportedAt: viewing.payload?.exportedAt, data: viewing.payload?.data }), 'application/json')}>Download as .json</Button>
            <Button size="lg" onClick={() => { setViewing(null); loadCloud(viewing) }}>Load this backup</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
