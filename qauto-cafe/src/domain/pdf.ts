// A minimal PDF writer: text with alignment, rules and boxes, across pages.
// Enough to lay out a tabular report; deliberately not a general PDF library.

export const PAGE_W = 612
export const PAGE_H = 792

export type RGB = [number, number, number]
export type Draw =
  | { op: 'text'; x: number; y: number; text: string; size?: number; bold?: boolean; align?: 'left' | 'right' | 'center'; rgb?: RGB }
  | { op: 'rect'; x: number; y: number; w: number; h: number; rgb?: RGB; lineWidth?: number }
  | { op: 'line'; x: number; y: number; w: number; rgb?: RGB; lineWidth?: number; dash?: boolean }

// Helvetica / Helvetica-Bold advance widths (per 1000 units) for ASCII 32-126.
// Needed because right-aligned money columns must line up exactly.
const W_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 278, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const W_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]

export function textWidth(text: string, size: number, bold = false): number {
  const table = bold ? W_BOLD : W_REGULAR
  let units = 0
  for (const ch of text) {
    const i = ch.charCodeAt(0) - 32
    units += i >= 0 && i < table.length ? table[i] : 556
  }
  return (units * size) / 1000
}

/** Truncates with an ellipsis so text never overruns the width it was given. */
export function fitText(text: string, maxWidth: number, size: number, bold = false): string {
  if (textWidth(text, size, bold) <= maxWidth) return text
  let out = text
  while (out.length > 1 && textWidth(`${out}...`, size, bold) > maxWidth) out = out.slice(0, -1)
  return `${out.trimEnd()}...`
}

function escape(text: string): string {
  return text.replace(/[^\x20-\x7E]/g, '-').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

const n = (v: number) => Math.round(v * 100) / 100
const BLACK: RGB = [0, 0, 0]

function toContent(d: Draw): string {
  const [r, g, b] = d.rgb ?? BLACK
  if (d.op === 'text') {
    const size = d.size ?? 9
    const w = textWidth(d.text, size, d.bold)
    const x = d.align === 'right' ? d.x - w : d.align === 'center' ? d.x - w / 2 : d.x
    return `${r} ${g} ${b} rg BT /${d.bold ? 'F2' : 'F1'} ${size} Tf ${n(x)} ${n(d.y)} Td (${escape(d.text)}) Tj ET`
  }
  if (d.op === 'rect') {
    return `${r} ${g} ${b} RG ${d.lineWidth ?? 0.7} w ${n(d.x)} ${n(d.y)} ${n(d.w)} ${n(d.h)} re S`
  }
  const dash = d.dash ? '[1.6 1.8] 0 d ' : ''
  const reset = d.dash ? ' [] 0 d' : ''
  return `${dash}${r} ${g} ${b} RG ${d.lineWidth ?? 0.7} w ${n(d.x)} ${n(d.y)} m ${n(d.x + d.w)} ${n(d.y)} l S${reset}`
}

export function buildPdf(pages: Draw[][]): Blob {
  const objects: string[] = []
  const add = (body: string) => { objects.push(body); return objects.length }
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
  const boldFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

  const pageIds: number[] = []
  for (const draws of pages) {
    const content = draws.map(toContent).join('\n')
    const stream = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    pageIds.push(add(
      `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 ${font} 0 R /F2 ${boldFont} 0 R >> >> /Contents ${stream} 0 R >>`,
    ))
  }
  const pagesId = add(`<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
  for (const id of pageIds) objects[id - 1] = objects[id - 1].replace('/Parent 0 0 R', `/Parent ${pagesId} 0 R`)
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.forEach(o => { pdf += `${String(o).padStart(10, '0')} 00000 n \n` })
  pdf += `trailer << /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`
  return new Blob([pdf], { type: 'application/pdf' })
}
