export interface Pt { x: number; y: number }

const n2 = (v: number) => Math.round(v * 100) / 100

/**
 * A smooth curve through every point, using monotone cubic interpolation
 * (Fritsch–Carlson).
 *
 * Chosen over a plain spline because it cannot overshoot: the curve never rises
 * above the highest neighbouring point nor dips below the lowest, so a quiet day
 * at zero revenue can never be drawn as negative, and a peak is never inflated
 * beyond what was actually taken.
 */
export function smoothPath(points: Pt[]): string {
  const n = points.length
  if (n === 0) return ''
  const at = (p: Pt) => `${n2(p.x)},${n2(p.y)}`
  if (n === 1) return `M${at(points[0])}`
  if (n === 2) return `M${at(points[0])} L${at(points[1])}`

  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = points[i + 1].x - points[i].x
    slope[i] = dx[i] === 0 ? 0 : (points[i + 1].y - points[i].y) / dx[i]
  }

  // Tangents, flattened at every turning point so the curve stays inside its data.
  const m: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) {
      m[i] = 0
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i])
    }
  }
  m[n - 1] = slope[n - 2]

  let d = `M${at(points[0])}`
  for (let i = 0; i < n - 1; i++) {
    const third = dx[i] / 3
    const c1 = { x: points[i].x + third, y: points[i].y + m[i] * third }
    const c2 = { x: points[i + 1].x - third, y: points[i + 1].y - m[i + 1] * third }
    d += ` C${at(c1)} ${at(c2)} ${at(points[i + 1])}`
  }
  return d
}

/** Closes a curve down to `baseY` so it can be filled as an area. */
export function areaPath(points: Pt[], baseY: number): string {
  if (points.length === 0) return ''
  const first = points[0]
  const last = points[points.length - 1]
  return `${smoothPath(points)} L${n2(last.x)},${n2(baseY)} L${n2(first.x)},${n2(baseY)} Z`
}
