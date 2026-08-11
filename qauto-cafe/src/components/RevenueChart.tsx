import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { formatQar } from '../domain/money'
import { axisTicks, labelStride, type RevenuePoint } from '../domain/revenueSeries'
import { areaPath, smoothPath } from '../domain/chartPath'

// The viewBox is sized to the card's real width so the drawing maps 1:1 to
// pixels. A fixed viewBox gets letterboxed on a wide card — preserveAspectRatio
// fits the whole box inside, scaling to the height and leaving gaps down both
// sides — and stretching it instead would distort the text.
const H = 260
const PAD = { top: 12, right: 8, bottom: 28, left: 56 }
const FALLBACK_W = 900
const PLOT_H = H - PAD.top - PAD.bottom

// Taken from the Figma export rather than guessed: the line is #999999 at 2px
// with round caps, the area is #465FFF on a vertical fade at 0.1 opacity, and
// the grid rules are #F2F2F2.
const INK = '#1a1a1a'
const MUTED = '#999'
const GRID = '#f2f2f2'
const LINE = '#999999'
const FILL = '#465fff'

/** Axis money with separators, as the design shows ("1,000" not "1k"). */
const tickLabel = (v: number) => Math.round(v).toLocaleString()

/**
 * Revenue over time for the window the dashboard is showing.
 *
 * Hand-rolled SVG rather than a charting dependency: it is one series on one
 * axis, and it matches how the rest of this project draws things.
 */
export function RevenueChart({ points, rangeLabel }: { points: RevenuePoint[]; rangeLabel: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(FALLBACK_W)

  // Width comes from the element itself, so the chart fills whatever space the
  // card gives it. The observer is the external system here; state is set from
  // its callback rather than in the effect body.
  useLayoutEffect(() => {
    const el = plotRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const measured = entries[0]?.contentRect.width ?? 0
      if (measured > 0) setWidth(Math.round(measured))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const W = width
  const PLOT_W = Math.max(1, W - PAD.left - PAD.right)

  const ticks = useMemo(() => axisTicks(Math.max(...points.map(p => p.value), 0)), [points])
  const top = ticks[ticks.length - 1] || 1
  const total = useMemo(() => points.reduce((sum, p) => sum + p.value, 0), [points])

  // A single point has no width to spread across, so it sits mid-plot.
  const x = (i: number) => points.length <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i * PLOT_W) / (points.length - 1)
  const y = (v: number) => PAD.top + PLOT_H - (v / top) * PLOT_H
  const step = points.length > 1 ? PLOT_W / (points.length - 1) : PLOT_W

  const coords = points.map((p, i) => ({ x: x(i), y: y(p.value) }))
  const line = smoothPath(coords)
  const area = areaPath(coords, PAD.top + PLOT_H)
  const stride = labelStride(points.length)
  const active = hover != null ? points[hover] : null

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 600, color: INK, lineHeight: '28px' }}>Revenue</div>
          {/* The window is named on the right, so this states the total only —
              lower-casing a date label also read badly ("23 jun 2026"). */}
          <div style={{ fontSize: 14, color: MUTED, lineHeight: '20px' }}>{formatQar(total)} in total</div>
        </div>
        <div style={{ fontSize: 14, color: MUTED, whiteSpace: 'nowrap' }}>{rangeLabel}</div>
      </div>

      {/* Always rendered, so the observer keeps measuring even while empty —
          otherwise going from no orders to some would keep the fallback width. */}
      <div ref={plotRef} style={{ position: 'relative' }}>
        {points.length === 0 ? (
          <div style={{ color: MUTED, padding: '24px 0' }}>No orders in this period.</div>
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`Revenue over ${rangeLabel}, ${formatQar(total)} in total`}
              style={{ width: '100%', height: H, display: 'block' }}
              onMouseLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="revenue-fill" x1="0" y1={PAD.top} x2="0" y2={PAD.top + PLOT_H} gradientUnits="userSpaceOnUse">
                  <stop stopColor={FILL} />
                  <stop offset="1" stopColor={FILL} stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Grid and y-axis. Recessive: the data is the subject. */}
              {ticks.map(t => (
                <g key={t}>
                  <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
                  <text x={PAD.left - 12} y={y(t) + 4} textAnchor="end" fontSize={12} fill={INK}>{tickLabel(t)}</text>
                </g>
              ))}

              <path d={area} fill="url(#revenue-fill)" opacity={0.1} />
              <path d={line} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

              {/* Crosshair for the slice under the pointer. */}
              {active && (
                <>
                  <line x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={PAD.top + PLOT_H} stroke={LINE} strokeOpacity={0.5} strokeWidth={1} />
                  <circle cx={x(hover!)} cy={y(active.value)} r={5} fill="#fff" stroke={LINE} strokeWidth={2} />
                </>
              )}

              {points.map((p, i) => (
                <text key={p.from} x={x(i)} y={H - 8} textAnchor="middle" fontSize={12} fill={i % stride === 0 ? INK : 'transparent'}>
                  {p.label}
                </text>
              ))}

              {/* Invisible hit areas, wider than the marks, so hovering is easy. */}
              {points.map((p, i) => (
                <rect
                  key={`hit-${p.from}`}
                  x={x(i) - step / 2}
                  y={PAD.top}
                  width={step}
                  height={PLOT_H}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              ))}
            </svg>

            {active && (
              <div
                role="status"
                style={{
                  position: 'absolute', top: 0, pointerEvents: 'none',
                  left: `${(x(hover!) / W) * 100}%`, transform: 'translateX(-50%)',
                  background: INK, color: '#fff', borderRadius: 8, padding: '6px 10px',
                  fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                }}
              >
                {active.label} · {formatQar(active.value)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
