import type { ReactNode } from 'react'

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div onClick={onClose} className="fixed inset-0 z-[900] grid place-items-center bg-black/40 font-sans">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title} className="max-h-[88vh] w-[min(560px,92vw)] overflow-auto rounded-card bg-card p-7 text-foreground shadow-pop">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg font-medium">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-10 min-h-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent text-2xl leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
