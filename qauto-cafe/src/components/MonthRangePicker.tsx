import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { currentMonthKey, monthSpanLabel } from '../domain/finance'

const pad = (n: number) => String(n).padStart(2, '0')
const keyOf = (year: number, month: number) => `${year}-${pad(month + 1)}`
const yearOf = (monthKey: string) => Number(monthKey.slice(0, 4))
const order = (a: string, b: string): [string, string] => (a <= b ? [a, b] : [b, a])
const SHORT = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleString(undefined, { month: 'short' }))
const LONG = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleString(undefined, { month: 'long' }))

const RANGE = '#ededed'
const INK = '#1a1a1a'
const POPUP_WIDTH = 340

/**
 * One month or a run of months, picked from a year grid.
 *
 * One tap picks that month on its own — the common case stays a single tap.
 * A second tap on another month turns it into a run between the two, in either
 * order and across years; tapping the same month again, Done, or anywhere
 * outside keeps the single month. Months after the current one cannot be picked.
 */
export function MonthRangePicker({ from, to, onChange, now = new Date() }: {
  from: string
  to: string
  onChange: (from: string, to: string) => void
  now?: Date
}) {
  const [open, setOpen] = useState(false)
  // The first tap of a pending run; null when nothing is half-picked.
  const [anchor, setAnchor] = useState<string | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [year, setYear] = useState(() => yearOf(to))
  // Which edge of the button the grid lines up with: it opens towards the side
  // with room, so it is never tucked behind the sidebar or off the screen.
  const [openRight, setOpenRight] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const latest = currentMonthKey(now)
  const [lo, hi] = anchor && hover ? order(anchor, hover) : order(from, to)
  const label = monthSpanLabel(from, to)

  const close = () => { setOpen(false); setAnchor(null); setHover(null) }

  // Outside taps and Escape close the grid, keeping whatever is picked so far.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setOpen(false); setAnchor(null); setHover(null) }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setAnchor(null); setHover(null); triggerRef.current?.focus() }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const pick = (k: string) => {
    if (!anchor) { setAnchor(k); onChange(k, k); return }
    if (k !== anchor) { const [a, b] = order(anchor, k); onChange(a, b) }
    close()
    triggerRef.current?.focus()
  }

  const quick = (a: string, b: string) => { onChange(a, b); close(); triggerRef.current?.focus() }
  const threeBack = (() => { const d = new Date(now.getFullYear(), now.getMonth() - 2, 1); return keyOf(d.getFullYear(), d.getMonth()) })()

  const cell = (k: string, col: number): { outer: CSSProperties; inner: CSSProperties } => {
    const single = lo === hi && k === lo
    const start = lo !== hi && k === lo
    const end = lo !== hi && k === hi
    const between = k > lo && k < hi
    const future = k > latest
    // The band joins the ends to the months between; it stops at the row's edges.
    let band = 'transparent'
    if (between) band = RANGE
    else if (start && col !== 3) band = `linear-gradient(to right, transparent 50%, ${RANGE} 50%)`
    else if (end && col !== 0) band = `linear-gradient(to left, transparent 50%, ${RANGE} 50%)`
    const rounded = between ? (col === 0 ? '8px 0 0 8px' : col === 3 ? '0 8px 8px 0' : 0) : 0
    const chosen = single || start || end
    return {
      outer: { height: 44, border: 'none', padding: 0, background: band, borderRadius: rounded, cursor: future ? 'default' : 'pointer', font: 'inherit' },
      inner: {
        display: 'grid', placeItems: 'center', height: '100%', borderRadius: 8, fontSize: 14, fontWeight: 600,
        background: chosen ? INK : 'transparent', color: chosen ? '#fff' : future ? '#c4c4c4' : 'var(--ink)',
        boxShadow: k === latest && !chosen ? 'inset 0 0 0 1px #d4d4d4' : 'none',
      },
    }
  }

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Month, ${label}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          if (open) { close(); return }
          const left = triggerRef.current?.getBoundingClientRect().left ?? 0
          setOpenRight(left + POPUP_WIDTH <= window.innerWidth - 16)
          setYear(yearOf(to))
          setOpen(true)
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 190,
          padding: 8, borderRadius: 8, border: `1px solid ${open ? INK : 'var(--line)'}`, background: '#fff',
          fontSize: 14, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer',
        }}
      >
        <span>{label}</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ color: 'var(--muted)' }}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
          <path d="M3.5 9.5h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Choose a month or a run of months"
          style={{
            position: 'absolute', ...(openRight ? { left: 0 } : { right: 0 }), top: 'calc(100% + 8px)', width: POPUP_WIDTH, maxWidth: 'calc(100vw - 32px)', zIndex: 20,
            background: '#fff', border: '1px solid #e5e5e5', borderRadius: 14, boxShadow: '0 10px 30px rgba(16,24,40,.14)', padding: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button type="button" aria-label="Previous year" onClick={() => setYear(y => y - 1)} style={yearBtn}>‹</button>
            <strong style={{ fontSize: 15 }}>{year}</strong>
            <button type="button" aria-label="Next year" disabled={year >= yearOf(latest)} onClick={() => setYear(y => y + 1)} style={{ ...yearBtn, opacity: year >= yearOf(latest) ? 0.35 : 1 }}>›</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', rowGap: 6 }} onMouseLeave={() => setHover(null)}>
            {SHORT.map((name, m) => {
              const k = keyOf(year, m)
              const s = cell(k, m % 4)
              return (
                <button
                  key={k}
                  type="button"
                  disabled={k > latest}
                  aria-label={`${LONG[m]} ${year}`}
                  aria-pressed={k >= lo && k <= hi}
                  onMouseEnter={() => { if (anchor) setHover(k) }}
                  onClick={() => pick(k)}
                  style={s.outer}
                >
                  <span style={s.inner}>{name}</span>
                </button>
              )
            })}
          </div>

          <p style={{ margin: '10px 2px 0', fontSize: 12, color: 'var(--muted)', minHeight: 16 }}>
            {anchor
              ? `${monthSpanLabel(anchor, anchor)} picked. Tap another month for a range, or Done.`
              : 'Tap a month. Tap a second month for a range.'}
          </p>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #eee' }}>
            <button type="button" onClick={() => quick(latest, latest)} style={linkBtn}>This month</button>
            <button type="button" onClick={() => quick(threeBack, latest)} style={linkBtn}>Last 3 months</button>
            <button type="button" onClick={() => { close(); triggerRef.current?.focus() }} style={{ background: INK, color: '#fff', border: 'none', borderRadius: 8, padding: '0 16px', minHeight: 36, fontWeight: 700, cursor: 'pointer' }}>Done</button>
          </div>
        </div>
      )}
    </div>
  )
}

const yearBtn: CSSProperties = {
  width: 36, height: 36, minHeight: 36, borderRadius: 8, border: '1px solid var(--line)', background: '#fff',
  fontSize: 18, lineHeight: 1, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--ink)',
}
const linkBtn: CSSProperties = {
  border: 'none', background: 'transparent', color: INK, fontWeight: 700, fontSize: 13, minHeight: 36,
  textDecoration: 'underline', textUnderlineOffset: 2, whiteSpace: 'nowrap', cursor: 'pointer', padding: '0 4px',
}
