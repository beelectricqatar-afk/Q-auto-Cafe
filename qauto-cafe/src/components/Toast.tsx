import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; msg: string; kind: 'ok' | 'warn' }
const Ctx = createContext<(msg: string, kind?: 'ok' | 'warn') => void>(() => {})
// eslint-disable-next-line react-refresh/only-export-components
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
      <div className="fixed bottom-5 left-1/2 z-[1000] grid -translate-x-1/2 gap-2 font-sans">
        {toasts.map(t => (
          <div key={t.id} role="status" className="flex min-w-[300px] items-center gap-2.5 rounded-control bg-card px-4 py-3 text-sm font-medium text-foreground shadow-pop">
            <span
              aria-hidden="true"
              className={t.kind === 'ok'
                ? 'grid size-5 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground'
                : 'grid size-5 shrink-0 place-items-center rounded-full bg-destructive text-xs font-bold text-white'}
            >
              {t.kind === 'ok' ? '✓' : '!'}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
