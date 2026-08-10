import { downloadBlob } from './csv'
import { exportXlsx, type XlsxColumn } from './xlsx'
import { buildPdf, fitText, PAGE_W, type Draw, type RGB } from './pdf'
import { applyDiscount } from './money'
import { branchLabel, ordersByBranch } from './branch'
import { paymentLabel } from './payment'
import { EXPENSE_CATEGORIES, makeExpense, orderGross, type FinanceSummary } from './finance'
import type { Data } from '../app/useData'
import type { FinanceExpense, Order } from '../db/schema'

const round2 = (n: number) => Math.round(n * 100) / 100

export const EXPENSE_TEMPLATE_COLUMNS: XlsxColumn[] = [
  { header: 'Date', key: 'date', width: 14 },
  { header: 'Category', key: 'category', width: 16 },
  { header: 'Vendor', key: 'vendor', width: 24 },
  { header: 'Description', key: 'description', width: 36 },
  { header: 'Amount QAR', key: 'amountQar', width: 14, money: true },
  { header: 'Payment Method', key: 'paymentMethod', width: 18 },
  { header: 'Reference', key: 'reference', width: 18 },
  { header: 'Notes', key: 'notes', width: 32 },
]

export function exportExpenseTemplate(): Promise<void> {
  return exportXlsx('q-cafe-expense-template.xlsx', 'Expenses', EXPENSE_TEMPLATE_COLUMNS, [
    { date: new Date().toISOString().slice(0, 10), category: 'supplies', vendor: '', description: '', amountQar: 0, paymentMethod: 'Cash', reference: '', notes: '' },
  ])
}

export function exportExpenses(expenses: FinanceExpense[], rangeKey: string): Promise<void> {
  const rows = expenses.map(e => ({
    date: e.date,
    category: e.category,
    vendor: e.vendor,
    description: e.description,
    amountQar: e.amountQar,
    paymentMethod: e.paymentMethod,
    reference: e.reference ?? '',
    notes: e.notes ?? '',
  }))
  return exportXlsx(`q-cafe-expenses-${rangeKey}.xlsx`, 'Expenses', EXPENSE_TEMPLATE_COLUMNS, rows, {
    totals: { date: 'Total', category: '', vendor: '', description: '', amountQar: round2(expenses.reduce((sum, e) => sum + e.amountQar, 0)), paymentMethod: '', reference: '', notes: '' },
  })
}

function staffName(data: Data, id: string | null): string {
  return data.staff.find(s => s.id === id)?.name ?? (id ? 'Unknown staff' : '')
}

function deptName(data: Data, id: string | null, walkin?: boolean): string {
  return walkin ? 'Retail' : (data.departments.find(d => d.id === id)?.name ?? 'Unassigned')
}

function categoryName(data: Data, itemId: string): string {
  const item = data.menuItems.find(i => i.id === itemId)
  return data.categories.find(c => c.id === item?.categoryId)?.name ?? 'Regular Item'
}

/** The staff discount the till offers, mirrored here for the sales export. */
export const STAFF_DISCOUNT_PCT = 15

// A `type` rather than an `interface` so it stays assignable to the
// Record<string, unknown> rows that exportXlsx takes.
export type DetailedSalesRow = {
  orderNo: number
  orderTime: string
  cafe: string
  paidBy: string
  orderType: string
  orderTakenBy: string
  customerName: string
  department: string
  customerNumber: string
  itemName: string
  qty: number
  itemType: string
  unitPrice: number
  discountedPrice: number
  totalPrice: number
}

export function detailedSalesRows(orders: Order[], data: Data): DetailedSalesRow[] {
  return orders.slice().sort((a, b) => a.timestamp - b.timestamp).flatMap((order, index) =>
    order.lines.map(line => {
      const totalPrice = round2(line.qty * line.unitPrice)
      return {
        orderNo: index + 1,
        orderTime: new Date(order.timestamp).toISOString().slice(0, 16).replace('T', ' '),
        cafe: branchLabel(order.branch),
        paidBy: paymentLabel(order.paymentMethod),
        orderType: order.walkin ? 'Walk-In' : 'Call Center',
        orderTakenBy: staffName(data, order.staffId) || 'Q Cafe POS',
        customerName: order.walkin ? (order.customerName || 'Walk In') : staffName(data, order.staffId),
        department: deptName(data, order.departmentId, order.walkin),
        customerNumber: data.staff.find(s => s.id === order.staffId)?.extension ?? '',
        itemName: line.name,
        qty: line.qty,
        itemType: categoryName(data, line.itemId),
        unitPrice: line.unitPrice,
        // Rounded the same way the till discounts a ticket, so the figures agree.
        discountedPrice: applyDiscount(totalPrice, STAFF_DISCOUNT_PCT),
        totalPrice,
      }
    }),
  )
}

export function exportDetailedSales(orders: Order[], data: Data, rangeKey: string): Promise<void> {
  const rows = detailedSalesRows(orders, data)
  return exportXlsx(`q-cafe-sales-${rangeKey}.xlsx`, 'Total Orders', [
    { header: 'Order No', key: 'orderNo', width: 12 },
    { header: 'Order Time', key: 'orderTime', width: 20 },
    { header: 'Cafe', key: 'cafe', width: 14 },
    { header: 'Paid By', key: 'paidBy', width: 12 },
    { header: 'Order Type', key: 'orderType', width: 18 },
    { header: 'Order Taken By', key: 'orderTakenBy', width: 24 },
    { header: 'Customer Name', key: 'customerName', width: 28 },
    { header: 'Department', key: 'department', width: 30 },
    { header: 'Customer Number', key: 'customerNumber', width: 18 },
    { header: 'Item name', key: 'itemName', width: 28 },
    { header: 'Qty', key: 'qty', width: 8 },
    { header: 'Item Type', key: 'itemType', width: 18 },
    { header: 'Unit Price', key: 'unitPrice', width: 14, money: true },
    { header: 'Discounted Price', key: 'discountedPrice', width: 18, money: true },
    { header: 'Total Price', key: 'totalPrice', width: 14, money: true },
  ], rows, {
    totals: {
      orderNo: 'Total',
      discountedPrice: round2(rows.reduce((sum, r) => sum + r.discountedPrice, 0)),
      totalPrice: round2(orders.reduce((sum, order) => sum + orderGross(order), 0)),
    },
  })
}

function normalizeHeader(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function normalizeCategory(value: unknown): FinanceExpense['category'] {
  const raw = String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-')
  return (EXPENSE_CATEGORIES as readonly string[]).includes(raw) ? raw as FinanceExpense['category'] : 'other'
}

function excelDateToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const utc = Math.round((value - 25569) * 86400 * 1000)
    return new Date(utc).toISOString().slice(0, 10)
  }
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : ''
}

export async function importExpenseWorkbook(file: File): Promise<{ expenses: FinanceExpense[]; errors: string[] }> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  const headerRow = ws.getRow(1)
  const columns = new Map<string, number>()
  headerRow.eachCell((cell, col) => columns.set(normalizeHeader(cell.value), col))
  const read = (row: number, names: string[]) => {
    const col = names.map(normalizeHeader).map(n => columns.get(n)).find(Boolean)
    return col ? ws.getRow(row).getCell(col).value : undefined
  }
  const expenses: FinanceExpense[] = []
  const errors: string[] = []
  for (let rowNo = 2; rowNo <= ws.rowCount; rowNo++) {
    const date = excelDateToIso(read(rowNo, ['Date']))
    const amount = Number(read(rowNo, ['Amount QAR', 'Amount', 'Value']))
    const description = String(read(rowNo, ['Description']) ?? '').trim()
    const vendor = String(read(rowNo, ['Vendor']) ?? '').trim()
    const isBlank = !date && !amount && !description && !vendor
    if (isBlank) continue
    if (!date) { errors.push(`Row ${rowNo}: missing or invalid date`); continue }
    if (!Number.isFinite(amount) || amount <= 0) { errors.push(`Row ${rowNo}: amount must be greater than zero`); continue }
    expenses.push(makeExpense({
      date,
      category: normalizeCategory(read(rowNo, ['Category'])),
      vendor,
      description,
      amountQar: amount,
      paymentMethod: String(read(rowNo, ['Payment Method', 'Payment']) ?? '').trim() || 'Cash',
      reference: String(read(rowNo, ['Reference']) ?? '').trim() || undefined,
      notes: String(read(rowNo, ['Notes']) ?? '').trim() || undefined,
      source: 'excel',
    }))
  }
  return { expenses, errors }
}

// ── Business Summary PDF ────────────────────────────────────────────────────
// Laid out as a stack of bordered sections, each with a ruled title, right-
// aligned figure columns and a bold total, flowing across as many pages as
// the data needs.

const PDF_MARGIN = 40
const PDF_CONTENT_W = PAGE_W - PDF_MARGIN * 2
const PDF_COL_W = 74          // width of one right-aligned figure column
const PDF_TITLE_H = 25        // section title row, down to its rule
const PDF_ROW_H = 16
const PDF_PAD_BOTTOM = 9
const PDF_SECTION_GAP = 13
const PDF_MIN_Y = 56          // never draw below this, leaving room for the footer

const INK: RGB = [0.1, 0.1, 0.1]
const MUTED: RGB = [0.42, 0.42, 0.42]
const BORDER: RGB = [0.78, 0.78, 0.78]
const NEGATIVE: RGB = [0.75, 0.13, 0.13]

/** Bare figure, no currency prefix — the columns are already money-labelled. */
const amount = (v: number) => round2(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** Deductions read as accounting negatives, e.g. (554.40). */
const deduction = (v: number) => v ? `(${amount(Math.abs(v))})` : amount(0)
const pct = (v: number) => `${round2(v).toFixed(2)}%`

interface PdfRow { label: string; cols: string[]; bold?: boolean; rule?: 'solid' | 'dashed' }
interface PdfSection { title: string; headers?: string[]; rows: PdfRow[]; note?: string }

const sectionHeight = (s: PdfSection) =>
  PDF_TITLE_H + s.rows.length * PDF_ROW_H + (s.note ? PDF_ROW_H : 0) + PDF_PAD_BOTTOM

/** Right edge of figure column `i` of `count`, measured in from the page margin. */
const colRight = (i: number, count: number) =>
  PDF_MARGIN + PDF_CONTENT_W - 12 - (count - 1 - i) * PDF_COL_W

function drawSection(page: Draw[], s: PdfSection, top: number): number {
  const height = sectionHeight(s)
  const bottom = top - height
  const innerL = PDF_MARGIN + 12
  const ruleL = PDF_MARGIN + 10
  const ruleW = PDF_CONTENT_W - 20
  const cols = Math.max(s.headers?.length ?? 0, ...s.rows.map(r => r.cols.length), 1)

  page.push({ op: 'rect', x: PDF_MARGIN, y: bottom, w: PDF_CONTENT_W, h: height, rgb: BORDER, lineWidth: 0.7 })

  const titleY = top - 17
  page.push({ op: 'text', x: innerL, y: titleY, text: s.title, size: 10.5, bold: true, rgb: INK })
  s.headers?.forEach((h, i) => {
    page.push({ op: 'text', x: colRight(i, cols), y: titleY, text: h, size: 8, bold: true, align: 'right', rgb: INK })
  })
  page.push({ op: 'line', x: ruleL, y: top - PDF_TITLE_H, w: ruleW, rgb: INK, lineWidth: 1 })

  let y = top - PDF_TITLE_H
  for (const row of s.rows) {
    y -= PDF_ROW_H
    if (row.rule) {
      page.push({ op: 'line', x: ruleL, y: y + 11, w: ruleW, rgb: row.rule === 'solid' ? INK : MUTED, lineWidth: row.rule === 'solid' ? 1 : 0.5, dash: row.rule === 'dashed' })
    }
    const labelW = colRight(0, cols) - innerL - PDF_COL_W * 0 - 14
    page.push({ op: 'text', x: innerL, y, text: fitText(row.label, labelW, 8.5, row.bold), size: 8.5, bold: row.bold, rgb: row.bold ? INK : MUTED })
    row.cols.forEach((c, i) => {
      // Short rows hug the right-hand columns, so figures stay in line.
      const slot = cols - row.cols.length + i
      // Only the bracketed deduction itself is red — a quantity beside it is not.
      const rgb = c.startsWith('(') ? NEGATIVE : row.bold ? INK : MUTED
      page.push({ op: 'text', x: colRight(slot, cols), y, text: c, size: 8.5, bold: row.bold, align: 'right', rgb })
    })
  }
  if (s.note) {
    y -= PDF_ROW_H
    page.push({ op: 'text', x: innerL, y, text: fitText(s.note, PDF_CONTENT_W - 24, 7.5), size: 7.5, rgb: MUTED })
  }
  return bottom
}

function buildSummarySections(summary: FinanceSummary): PdfSection[] {
  const sections: PdfSection[] = []

  // No paid modifiers or surcharges exist in this POS, so sales and gross sales
  // would always be the same figure — one row, not two.
  sections.push({
    title: 'Revenues',
    rows: [
      { label: 'Gross Sales', cols: [amount(summary.grossSales)] },
      { label: 'Discounts', cols: [deduction(summary.discounts)], rule: 'dashed' },
      { label: 'Net Sales', cols: [amount(summary.netSales)], bold: true, rule: 'solid' },
    ],
  })

  sections.push({
    title: 'Order Types',
    headers: ['Orders', '%', 'Value'],
    rows: [
      ...summary.orderTypes.map(o => ({ label: o.name, cols: [String(o.orderCount), pct(o.pct), amount(o.value)] })),
      { label: 'Total', cols: [String(summary.orders.length), '', amount(summary.netSales)], bold: true, rule: 'solid' },
    ],
  })

  sections.push({
    title: 'Wastage',
    rows: [
      ...summary.wastages.slice(0, 10).map(w => ({ label: w.itemName || 'Wastage', cols: [amount(w.amountQar ?? 0)] })),
      { label: 'Total', cols: [amount(summary.wastageTotal)], bold: true, rule: 'solid' },
    ],
  })

  sections.push({
    title: 'Costs & Profits',
    rows: [
      { label: 'Net Sales', cols: [amount(summary.netSales)] },
      // Expenses and wastage are shown as the make-up of COGS, not as further
      // deductions — subtracting them again would double-count.
      { label: 'Expenses', cols: [amount(summary.expenseTotal)] },
      { label: 'Total Wastage', cols: [amount(summary.wastageTotal)] },
      { label: 'COGS', cols: [amount(summary.cogs)], rule: 'dashed' },
      { label: 'Gross Profit', cols: [amount(summary.grossProfit)], bold: true, rule: 'solid' },
      { label: 'Net Profit', cols: [amount(summary.netProfit)], bold: true },
    ],
    note: summary.cogs === 0 && summary.netSales > 0
      ? 'No expenses or wastage recorded for this period, so profit equals net sales.'
      : undefined,
  })

  const discounted = summary.orders.filter(o => o.discountPct)
  sections.push({
    title: 'Discount',
    headers: ['Qty', 'Value'],
    rows: [
      { label: 'Staff (15%)', cols: [String(discounted.length), deduction(summary.discounts)] },
      { label: 'Total', cols: [String(discounted.length), deduction(summary.discounts)], bold: true, rule: 'solid' },
    ],
  })

  sections.push({
    title: 'Payment Types',
    headers: ['Qty', 'Value'],
    rows: [
      ...summary.paymentTypes.map(p => ({ label: p.name, cols: [String(p.qty), amount(p.value)] })),
      { label: 'Total', cols: [String(summary.orders.length), amount(summary.netSales)], bold: true, rule: 'solid' },
    ],
  })

  sections.push({
    title: 'Voids',
    headers: ['Qty', 'Value'],
    rows: [
      { label: 'Item Voids', cols: [String(summary.voids.itemVoids), amount(0)] },
      { label: 'Order voids', cols: [String(summary.voids.orderVoids), amount(summary.voids.value)] },
      { label: 'Total', cols: ['', amount(summary.voids.value)], bold: true, rule: 'solid' },
    ],
  })

  // Only worth a section once orders actually carry a branch.
  const byBranch = ordersByBranch(summary.orders)
  if (byBranch.some(b => b.name !== 'Unassigned')) {
    sections.push({
      title: 'Sales by Cafe',
      headers: ['Orders', '%', 'Value'],
      rows: [
        ...byBranch.map(b => ({
          label: b.name,
          cols: [String(b.orderCount), pct(summary.orders.length ? (b.orderCount / summary.orders.length) * 100 : 0), amount(b.value)],
        })),
        { label: 'Total', cols: [String(summary.orders.length), '', amount(summary.netSales)], bold: true, rule: 'solid' as const },
      ],
    })
  }

  sections.push({
    title: 'Sales by Staff',
    headers: ['Qty', '%', 'Value'],
    rows: [
      ...summary.salesByStaff.map(s => ({ label: s.name, cols: [String(s.qty), pct(s.pct), amount(s.value)] })),
      { label: 'Total Sales', cols: [String(summary.orders.length), '', amount(summary.netSales)], bold: true, rule: 'solid' },
    ],
  })

  const catQty = summary.salesByCategory.reduce((n, r) => n + r.qty, 0)
  const catValue = summary.salesByCategory.reduce((n, r) => n + r.value, 0)
  sections.push({
    title: 'Sales by Category',
    headers: ['Qty', 'Qty %', 'Value', 'Value %'],
    rows: [
      ...summary.salesByCategory.map(c => ({ label: c.name, cols: [String(c.qty), pct(c.pctQty), amount(c.value), pct(c.pctValue)] })),
      { label: 'Total Sales', cols: [String(catQty), '', amount(catValue), ''], bold: true, rule: 'solid' },
    ],
  })

  const tagQty = summary.salesByTag.reduce((n, r) => n + r.qty, 0)
  const tagValue = summary.salesByTag.reduce((n, r) => n + r.value, 0)
  sections.push({
    title: 'Sales by Tag',
    headers: ['Qty', 'Qty %', 'Value', 'Value %'],
    rows: [
      ...summary.salesByTag.map(t => ({ label: t.name, cols: [String(t.qty), pct(t.pctQty), amount(t.value), pct(t.pctValue)] })),
      { label: 'Total Sales', cols: [String(tagQty), '', amount(tagValue), ''], bold: true, rule: 'solid' },
    ],
  })

  const deptValue = summary.departmentCollections.reduce((n, r) => n + r.value, 0)
  const deptQty = summary.departmentCollections.reduce((n, r) => n + r.qty, 0)
  sections.push({
    title: 'Department Collections',
    headers: ['Qty', 'Qty %', 'Value'],
    rows: [
      ...summary.departmentCollections.map(d => ({ label: d.name, cols: [String(d.qty), pct(d.pct), amount(d.value)] })),
      { label: 'Total Sales', cols: [String(deptQty), '', amount(deptValue)], bold: true, rule: 'solid' },
    ],
  })

  if (summary.expensesByCategory.length) {
    sections.push({
      title: 'Expenses by Category',
      headers: ['Value'],
      rows: [
        ...summary.expensesByCategory.map(e => ({ label: e.name, cols: [amount(e.value)] })),
        { label: 'Total', cols: [amount(summary.expenseTotal)], bold: true, rule: 'solid' },
      ],
    })
  }

  // A section with nothing but its total reads as an error; say so instead.
  return sections.map(s => s.rows.length > 1 ? s : { ...s, rows: [{ label: 'No activity in this period', cols: [] }, ...s.rows] })
}

export function exportBusinessSummaryPdf(summary: FinanceSummary): void {
  downloadBlob(`q-cafe-business-summary-${summary.range.key}.pdf`, buildBusinessSummaryPdf(summary))
}

/** Split from the download so the layout can be exercised in tests. */
export function buildBusinessSummaryPdf(summary: FinanceSummary): Blob {
  const sections = buildSummarySections(summary)
  const printed = new Date()

  // Lay the sections out across pages before drawing, so the footer can number them.
  const pages: Draw[][] = []
  let page: Draw[] = []
  let first = true
  let y = 0

  const startPage = () => {
    page = []
    if (first) {
      page.push({ op: 'text', x: PAGE_W / 2, y: 742, text: 'Business Summary', size: 19, bold: true, align: 'center', rgb: INK })
      page.push({ op: 'text', x: PAGE_W / 2, y: 727, text: 'Q-Auto Cafe', size: 8.5, align: 'center', rgb: MUTED })
      page.push({ op: 'text', x: PDF_MARGIN, y: 707, text: `Period: ${summary.range.label}`, size: 8, rgb: INK })
      page.push({ op: 'text', x: PAGE_W - PDF_MARGIN, y: 707, text: `Printed on ${printed.toLocaleString()}`, size: 8, align: 'right', rgb: INK })
      page.push({ op: 'line', x: PDF_MARGIN, y: 699, w: PDF_CONTENT_W, rgb: INK, lineWidth: 0.8 })
      y = 683
    } else {
      page.push({ op: 'text', x: PAGE_W / 2, y: 754, text: 'Business Summary', size: 8.5, align: 'center', rgb: MUTED })
      page.push({ op: 'text', x: PDF_MARGIN, y: 754, text: summary.range.label, size: 8.5, rgb: MUTED })
      y = 736
    }
    first = false
    pages.push(page)
  }

  // How many rows still fit above the footer, once the title row is allowed for.
  const rowCapacity = () => Math.floor((y - PDF_MIN_Y - PDF_TITLE_H - PDF_PAD_BOTTOM) / PDF_ROW_H)

  startPage()
  for (const s of sections) {
    // A long section (every member of staff, say) is split across pages rather
    // than overflowing, with the title repeated on each continuation.
    let remaining = s.rows
    let continued = false
    while (remaining.length) {
      let capacity = rowCapacity()
      if (capacity < 2) { startPage(); capacity = rowCapacity() }
      const noteRows = s.note ? 1 : 0
      const finishes = remaining.length + noteRows <= capacity
      const take = finishes ? remaining.length : capacity
      y = drawSection(page, {
        title: continued ? `${s.title} (continued)` : s.title,
        headers: s.headers,
        rows: remaining.slice(0, take),
        note: finishes ? s.note : undefined,
      }, y) - PDF_SECTION_GAP
      remaining = remaining.slice(take)
      continued = true
    }
  }

  pages.forEach((p, i) => {
    p.push({ op: 'text', x: PDF_MARGIN, y: 32, text: 'Q-Auto Cafe POS - Business Summary', size: 7.5, rgb: MUTED })
    p.push({ op: 'text', x: PAGE_W - PDF_MARGIN, y: 32, text: `${i + 1}/${pages.length}`, size: 7.5, align: 'right', rgb: MUTED })
  })

  return buildPdf(pages)
}
