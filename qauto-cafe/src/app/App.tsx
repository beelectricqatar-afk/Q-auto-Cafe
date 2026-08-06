import { useState } from 'react'
import { ToastProvider } from '../components/Toast'
import { useData } from './useData'
import type { SyncStatus } from '../sync/sync'
import type { View } from './routes'
import { BaristaPanel } from '../features/barista/BaristaPanel'
import { AdminPanel } from '../features/admin/AdminPanel'
import qautoLogoWhite from '../assets/brand/qauto-logo-white.svg'
import qautoWordmarkWhite from '../assets/brand/qauto-wordmark-white.svg'

export default function App() {
  const { data, status, refresh } = useData()
  const [view, setView] = useState<View>('barista')
  if (!data) return <div style={{ color: '#fff', padding: 24 }}>Loading…</div>
  return (
    <ToastProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', position: 'relative' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', color: '#fff' }}>
          {view === 'barista'
            ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <img src={qautoLogoWhite} alt="" width={28} height={28} />
                <img src={qautoWordmarkWhite} alt="Q-Auto" height={20} />
              </div>
            )
            : <strong style={{ letterSpacing: 1 }}>Q-AUTO CAFE</strong>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SyncPill status={status} />
            <button onClick={() => setView('barista')} style={tab(view === 'barista')}>Barista</button>
            <button onClick={() => { setView('admin') }} style={tab(view === 'admin')}>Admin</button>
          </div>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {view === 'barista'
            ? <BaristaPanel data={data} onPlaced={refresh} />
            : <AdminPanel data={data} refresh={refresh} />}
        </main>
      </div>
    </ToastProvider>
  )
}
const tab = (active: boolean) => ({ background: active ? '#fff' : '#1A1A1A', color: active ? '#1A1A1A' : '#fff', border: active ? '1px solid #e5e5e5' : 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700 } as const)

// Silence is only reassuring when a failure would be loud. Nothing shows while
// syncing cleanly; a problem says what it is rather than letting records go
// quietly missing.
function SyncPill({ status }: { status: SyncStatus | null }) {
  if (!status) return null
  const { offline, failed, pending } = status
  const unsent = pending > 0 ? ` · ${pending} unsent` : ''
  const pill = (background: string, text: string, title: string) => (
    <span
      role="status"
      title={title}
      style={{ background, color: '#1A1A1A', borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}
    >
      {text}
    </span>
  )
  if (failed.length) return pill('#ff6b6b', `Sync error · ${failed.join(', ')}`, `These tables failed to sync: ${failed.join(', ')}. Local changes are kept and retried.`)
  if (offline) return pill('#f0c36a', `Offline${unsent}`, 'No connection. Orders are saved on this device and sync when it returns.')
  if (pending > 0) return pill('#f0c36a', `${pending} unsent`, 'Local changes have not reached the cloud yet.')
  return null
}
