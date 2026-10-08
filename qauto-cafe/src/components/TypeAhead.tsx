import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { matchNames, replaceWordAt, wordAt } from '../domain/search'
import { cn } from '../lib/utils'

type Box = HTMLInputElement | HTMLTextAreaElement

interface TypeAheadProps {
  value: string
  onChange: (value: string) => void
  /** The names to complete from, usually the inventory. */
  names: string[]
  /** Optional note shown to the right of a suggestion, e.g. current stock. */
  hint?: (name: string) => string
  /** A textarea of this many rows instead of a single-line input. */
  rows?: number
  placeholder?: string
  label: string
  style?: React.CSSProperties
  className?: string
}

/**
 * A free-text box that completes the word under the caret from a list of names.
 *
 * It completes the word, not the whole field, so a suggestion can be taken in
 * the middle of a sentence — "we need ora" becomes "we need Fresh Orange " and
 * typing carries on. That is what makes the same control work for a request
 * listing several items and for an expense description naming one.
 *
 * The caller must let the suggestion list escape its container: a Card clips to
 * its rounded corners, so pass `style={{ overflow: 'visible' }}` to it or the
 * list is cut off.
 */
export function TypeAhead({ value, onChange, names, hint, rows, placeholder, label, style, className }: TypeAheadProps) {
  const boxRef = useRef<Box>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const suggestions = useMemo(
    () => dismissed ? [] : matchNames(wordAt(value, caret).word, names),
    [dismissed, value, caret, names],
  )

  // Once the completed text is on screen, move the real caret to match.
  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at == null) return
    pendingCaret.current = null
    boxRef.current?.focus()
    boxRef.current?.setSelectionRange(at, at)
  }, [value])

  const accept = (name: string) => {
    const next = replaceWordAt(value, caret, name)
    pendingCaret.current = next.caret
    onChange(next.text)
    setCaret(next.caret)
    setHighlight(0)
    // The completed name would otherwise match itself and reopen the list.
    setDismissed(true)
  }

  const onKeyDown = (e: React.KeyboardEvent<Box>) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % suggestions.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight(h => (h - 1 + suggestions.length) % suggestions.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(suggestions[highlight]) }
    else if (e.key === 'Escape') { e.preventDefault(); setDismissed(true) }
  }

  const syncCaret = (el: Box) => setCaret(el.selectionStart ?? el.value.length)

  const shared = {
    value,
    onChange: (e: React.ChangeEvent<Box>) => { onChange(e.target.value); setDismissed(false); setHighlight(0); syncCaret(e.target) },
    onKeyUp: (e: React.KeyboardEvent<Box>) => syncCaret(e.currentTarget),
    onClick: (e: React.MouseEvent<Box>) => syncCaret(e.currentTarget),
    onBlur: () => setTimeout(() => setDismissed(true), 120),
    onKeyDown,
    placeholder,
    'aria-label': label,
    style,
    className: cn(className, rows && 'h-auto py-2.5'),
  }

  return (
    <div className="relative">
      {rows
        ? <textarea ref={boxRef as React.RefObject<HTMLTextAreaElement>} rows={rows} {...shared} />
        : <input ref={boxRef as React.RefObject<HTMLInputElement>} {...shared} />}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute inset-x-0 top-[calc(100%+6px)] z-30 max-h-[260px] overflow-y-auto grid gap-0.5 rounded-control border border-border bg-card p-1 font-sans shadow-pop"
        >
          {suggestions.map((name, i) => (
            <button
              key={name}
              role="option"
              aria-selected={i === highlight}
              // The box's blur would close the list before the click lands.
              onMouseDown={e => { e.preventDefault(); accept(name) }}
              onMouseEnter={() => setHighlight(i)}
              className={cn('flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-[8px] border-0 px-3 text-left text-sm text-foreground', i === highlight ? 'bg-muted' : 'bg-transparent hover:bg-muted')}
            >
              <span>{name}</span>
              <span className="text-xs text-muted-foreground">{hint?.(name) ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
