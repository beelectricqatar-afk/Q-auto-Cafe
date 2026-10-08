import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Button } from './button'

export interface ConfirmOptions {
  /** The question, e.g. "Delete Fresh Milk?". Also the dialog's accessible name. */
  title: string
  /** What happens if they go ahead, in a sentence. */
  description?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button, for something that cannot be taken back. Default true. */
  destructive?: boolean
}

/**
 * Asks before doing something that cannot be undone — a stray tap on a tablet
 * must not wipe a record from every device.
 *
 *   const { confirm, dialog } = useConfirm()
 *   if (await confirm({ title: 'Delete Fresh Milk?' })) remove(id)
 *   ...
 *   return <>{...}{dialog}</>
 *
 * The dialog is rendered by the caller, so it needs no provider. Cancel has
 * the focus when it opens, so Enter on a keyboard never deletes by accident;
 * Escape cancels. Tapping outside does nothing — the choice is made on a button.
 */
export function useConfirm() {
  const [request, setRequest] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) =>
    new Promise<boolean>(resolve => setRequest({ ...options, resolve })), [])

  const settle = (ok: boolean) => {
    request?.resolve(ok)
    setRequest(null)
  }

  const dialog = request ? <ConfirmDialog {...request} onConfirm={() => settle(true)} onCancel={() => settle(false)} /> : null
  return { confirm, dialog }
}

// A hook and its dialog live together; the dialog is never used on its own.
// eslint-disable-next-line react-refresh/only-export-components
function ConfirmDialog({ title, description, confirmLabel = 'Delete', cancelLabel = 'Cancel', destructive = true, onConfirm, onCancel }: ConfirmOptions & {
  onConfirm: () => void
  onCancel: () => void
}) {
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    cancelRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-[950] grid place-items-center bg-black/40 p-4 font-sans">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={description ? descriptionId : undefined}
        className="grid w-[min(440px,100%)] gap-5 rounded-card bg-card p-7 text-foreground shadow-pop"
      >
        <div className="grid gap-2">
          <h2 className="m-0 text-lg font-medium">{title}</h2>
          {description && <p id={descriptionId} className="m-0 text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>{cancelLabel}</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  )
}
