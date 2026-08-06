import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; msg: string; kind: 'ok' | 'warn' }
const Ctx = createContext<(msg: string, kind?: 'ok' | 'warn') => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, kind: 'ok' | 'warn' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'grid', gap: 8, zIndex: 1000 }}>
        {toasts.map(t => (
          <div key={t.id} role="status" style={{ background: t.kind === 'ok' ? 'var(--accent)' : 'var(--danger)', color: '#06231a', padding: '12px 20px', borderRadius: 'var(--radius)', fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,.25)' }}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
