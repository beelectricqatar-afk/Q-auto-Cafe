function cell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.join(','), ...rows.map(r => headers.map(h => cell(r[h])).join(','))]
  return lines.join('\r\n')
}
/** Triggers a browser download of text content. */
export function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  downloadBlob(filename, new Blob([text], { type: mime }))
}

/** Triggers a browser download of a Blob (e.g. an .xlsx workbook). */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
