import type { ReactNode } from 'react'

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div onClick={onClose} className="fixed inset-0 z-[900] grid place-items-center bg-black/40 font-sans">
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title} className="max-h-[88vh] w-[min(520px,92vw)] overflow-auto rounded-card bg-card p-6 text-foreground shadow-pop">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="m-0 text-lg leading-none font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="inline-flex size-8 min-h-0 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-xl leading-none text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
