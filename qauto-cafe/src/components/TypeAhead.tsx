import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { matchNames, replaceWordAt, wordAt } from '../domain/search'

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
export function TypeAhead({ value, onChange, names, hint, rows, placeholder, label, style }: TypeAheadProps) {
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
  }

  return (
    <div style={{ position: 'relative' }}>
      {rows
        ? <textarea ref={boxRef as React.RefObject<HTMLTextAreaElement>} rows={rows} {...shared} />
        : <input ref={boxRef as React.RefObject<HTMLInputElement>} {...shared} />}
      {suggestions.length > 0 && (
        <div
          role="listbox"
          aria-label={`${label} suggestions`}
          style={{ position: 'absolute', zIndex: 5, left: 0, right: 0, top: 'calc(100% + 4px)', background: '#fff', border: '1px solid var(--line)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflowY: 'auto', maxHeight: 260 }}
        >
          {suggestions.map((name, i) => (
            <button
              key={name}
              role="option"
              aria-selected={i === highlight}
              // The box's blur would close the list before the click lands.
              onMouseDown={e => { e.preventDefault(); accept(name) }}
              onMouseEnter={() => setHighlight(i)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', padding: '9px 12px', fontSize: 15, cursor: 'pointer', background: i === highlight ? '#f2f2f2' : '#fff' }}
            >
              <span>{name}</span>
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>{hint?.(name) ?? ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
