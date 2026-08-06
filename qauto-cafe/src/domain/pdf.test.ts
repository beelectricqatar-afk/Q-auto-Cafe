import { describe, it, expect } from 'vitest'
import { buildPdf, fitText, textWidth, type Draw } from './pdf'

describe('textWidth', () => {
  it('measures digits exactly, so money columns can be right-aligned', () => {
    // Every Helvetica digit advances 556/1000 em, in both weights.
    expect(textWidth('1234', 10)).toBeCloseTo(22.24, 5)
    expect(textWidth('1234', 10, true)).toBeCloseTo(22.24, 5)
  })

  it('scales with font size', () => {
    expect(textWidth('Total', 16)).toBeCloseTo(textWidth('Total', 8) * 2, 5)
  })

  it('makes bold wider than regular for letters', () => {
    expect(textWidth('Revenues', 10, true)).toBeGreaterThan(textWidth('Revenues', 10))
  })

  it('does not crash on characters outside the metric table', () => {
    expect(textWidth('café €', 10)).toBeGreaterThan(0)
  })
})

describe('fitText', () => {
  it('leaves text that already fits alone', () => {
    expect(fitText('Hot Drinks', 200, 9)).toBe('Hot Drinks')
  })

  it('truncates with an ellipsis to stay inside the width', () => {
    const out = fitText('Projects, Admin & Facility Department / Be Electric', 60, 9)
    expect(out.endsWith('...')).toBe(true)
    expect(textWidth(out, 9)).toBeLessThanOrEqual(60)
  })
})

describe('buildPdf', () => {
  const page = (text: string): Draw[] => [
    { op: 'text', x: 40, y: 700, text, size: 10 },
    { op: 'rect', x: 40, y: 100, w: 500, h: 200 },
    { op: 'line', x: 40, y: 90, w: 500, dash: true },
  ]

  const read = (blob: Blob) => blob.text()

  it('emits a structurally complete single-page document', async () => {
    const pdf = await read(buildPdf([page('Business Summary')]))
    expect(pdf.startsWith('%PDF-1.4')).toBe(true)
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true)
    expect(pdf).toContain('/Type /Catalog')
    expect(pdf).toContain('/Count 1')
    expect(pdf).toContain('(Business Summary) Tj')
  })

  it('declares every page and links them all to the page tree', async () => {
    const pdf = await read(buildPdf([page('one'), page('two'), page('three')]))
    expect(pdf).toContain('/Count 3')
    expect(pdf.match(/\/Type \/Page[^s]/g)).toHaveLength(3)
    // No page may be left with the placeholder parent used while building.
    expect(pdf).not.toContain('/Parent 0 0 R')
  })

  it('declares a stream length matching the actual stream', async () => {
    const pdf = await read(buildPdf([page('length check')]))
    const declared = Number(/<< \/Length (\d+) >>/.exec(pdf)![1])
    const body = /stream\n([\s\S]*?)\nendstream/.exec(pdf)![1]
    expect(body).toHaveLength(declared)
  })

  it('writes one xref entry per object', async () => {
    const pdf = await read(buildPdf([page('xref')]))
    const size = Number(/\/Size (\d+)/.exec(pdf)![1])
    expect(pdf).toContain(`xref\n0 ${size}`)
    expect(pdf.match(/^\d{10} 00000 n $/gm)).toHaveLength(size - 1)
  })

  it('escapes characters that would break PDF string syntax', async () => {
    const pdf = await read(buildPdf([[{ op: 'text', x: 0, y: 0, text: 'Total (15%) \\ off' }]]))
    expect(pdf).toContain('(Total \\(15%\\) \\\\ off) Tj')
  })
})
