import { describe, it, expect } from 'vitest'
import { areaPath, smoothPath, type Pt } from './chartPath'

/** Samples the rendered cubic densely so overshoot can actually be measured. */
function sampleY(points: Pt[]): number[] {
  const d = smoothPath(points)
  const segs = d.split('C').slice(1)
  let prev = points[0]
  const ys: number[] = [prev.y]
  segs.forEach((seg, i) => {
    const [, c1y, , c2y, , py] = seg.trim().split(/[ ,]+/).map(Number)
    for (let t = 0; t <= 1; t += 0.05) {
      const u = 1 - t
      ys.push(u ** 3 * prev.y + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t ** 3 * py)
    }
    prev = points[i + 1]
  })
  return ys
}

describe('smoothPath', () => {
  it('is empty for no points', () => {
    expect(smoothPath([])).toBe('')
  })

  it('is a move for a single point', () => {
    expect(smoothPath([{ x: 1, y: 2 }])).toBe('M1,2')
  })

  it('is a straight line for two points', () => {
    expect(smoothPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M0,0 L10,5')
  })

  it('passes exactly through every point', () => {
    const pts = [{ x: 0, y: 50 }, { x: 10, y: 10 }, { x: 20, y: 40 }, { x: 30, y: 0 }]
    const d = smoothPath(pts)
    for (const p of pts.slice(1)) expect(d).toContain(`${p.x},${p.y}`)
    expect(d.startsWith('M0,50')).toBe(true)
  })

  it('never dips below the lowest point — a zero day must not draw negative', () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 100 }, { x: 20, y: 0 }, { x: 30, y: 100 }, { x: 40, y: 0 }]
    const ys = sampleY(pts)
    // y grows downward in SVG, so the floor is the largest y.
    expect(Math.max(...ys)).toBeLessThanOrEqual(100 + 1e-6)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0 - 1e-6)
  })

  it('never overshoots a peak', () => {
    const pts = [{ x: 0, y: 80 }, { x: 10, y: 80 }, { x: 20, y: 10 }, { x: 30, y: 80 }, { x: 40, y: 80 }]
    expect(Math.min(...sampleY(pts))).toBeGreaterThanOrEqual(10 - 1e-6)
  })

  it('stays flat through equal values', () => {
    const ys = sampleY([{ x: 0, y: 40 }, { x: 10, y: 40 }, { x: 20, y: 40 }])
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1e-6)
  })

  it('produces no NaN on repeated x values', () => {
    expect(smoothPath([{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 10, y: 3 }])).not.toContain('NaN')
  })
})

describe('areaPath', () => {
  it('closes the curve down to the baseline', () => {
    const d = areaPath([{ x: 0, y: 10 }, { x: 10, y: 20 }], 100)
    expect(d.startsWith('M0,10')).toBe(true)
    expect(d.endsWith('L10,100 L0,100 Z')).toBe(true)
  })

  it('is empty for no points', () => {
    expect(areaPath([], 100)).toBe('')
  })
})
