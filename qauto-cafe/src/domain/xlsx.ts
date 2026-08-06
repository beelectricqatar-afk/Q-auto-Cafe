import { downloadBlob } from './csv'

export interface XlsxColumn { header: string; key: string; width?: number; money?: boolean }

// Build and download a tidy, formatted .xlsx: bold green header row, frozen and
// filterable, sensible column widths, QAR currency formatting, zebra striping,
// and an optional bold totals row.
export async function exportXlsx(
  filename: string,
  sheetName: string,
  columns: XlsxColumn[],
  rows: Record<string, unknown>[],
  opts?: { totals?: Record<string, unknown> },
): Promise<void> {
  const ExcelJS = (await import('exceljs')).default // lazy-loaded only when exporting
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })
  ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width ?? 20 }))

  const header = ws.getRow(1)
  header.height = 22
  header.eachCell(c => {
    c.font = { bold: true, color: { argb: 'FF0B3D2C' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF32D282' } }
    c.alignment = { vertical: 'middle' }
    c.border = { bottom: { style: 'thin', color: { argb: 'FF9AD9BE' } } }
  })

  rows.forEach((r, i) => {
    const row = ws.addRow(r)
    if (i % 2 === 1) row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7F5' } } })
  })

  columns.forEach((c, i) => { if (c.money) ws.getColumn(i + 1).numFmt = '"QAR" #,##0.00' })

  if (opts?.totals) {
    const tr = ws.addRow(opts.totals)
    tr.eachCell(c => {
      c.font = { bold: true }
      c.border = { top: { style: 'double', color: { argb: 'FF0B3D2C' } } }
    })
  }

  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(filename, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
}
