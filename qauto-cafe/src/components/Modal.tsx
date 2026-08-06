import type { ReactNode } from 'react'

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 900 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 24, width: 'min(560px, 92vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 24 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
