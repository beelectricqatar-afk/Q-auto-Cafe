export type Unit = 'ml' | 'g' | 'pcs' | 'shot' | 'oz' | 'slices' | 'leaves' | 'bag'
export type ExpenseCategory = 'supplies' | 'utilities' | 'maintenance' | 'packaging' | 'petty-cash' | 'salaries' | 'rent' | 'other'

export interface Department { id: string; name: string; mainExtension: string; active: boolean }
export interface Staff { id: string; name: string; position: string; email: string; extension: string; departmentId: string; active: boolean }
// `stockQty` is always counted in whole `unit`s (e.g. lemons).
// An ingredient may optionally be divided into sub-units (e.g. 1 lemon = 10
// slices): recipes are then written in sub-units, and stock still draws down in
// whole units, with the part-used unit carried in `openSubQty`. Configured only
// when `subUnitPer > 0` — a blank number field saves as 0, which means "off".
export interface Ingredient {
  id: string
  name: string
  unit: Unit
  stockQty: number
  lowStockThreshold: number
  unitCostQar?: number
  subUnit?: Unit      // what one unit is divided into, e.g. 'slices'
  subUnitPer?: number // how many sub-units one unit yields, e.g. 10
  openSubQty?: number // sub-units left in the currently-opened unit, e.g. 6
}
export interface Category { id: string; name: string; sortOrder: number }
export interface RecipeLine { ingredientId: string; qty: number }
// `addOn` marks a free extra (chocolate flakes, an extra sugar). It shows as
// "Free" rather than QAR 0.00, and still deducts its recipe from stock. The
// flag is explicit so a genuine item left at price 0 by mistake keeps showing a
// price and stays visible as a problem.
export interface MenuItem { id: string; name: string; categoryId: string; price: number; active: boolean; recipe: RecipeLine[]; needsPriceReview?: boolean; addOn?: boolean }
// `recipe` overrides the menu item's recipe for this line alone — set when a
// barista tailors a drink for one customer. Absent means "use the menu item's
// recipe", so later edits to the menu still apply to untouched lines.
export interface OrderLine { itemId: string; name: string; qty: number; unitPrice: number; recipe?: RecipeLine[] }
export interface Order { id: string; timestamp: number; staffId: string | null; departmentId: string | null; lines: OrderLine[]; total: number; note?: string; walkin?: boolean; customerName?: string; discountPct?: number }
export type AdjustmentReason = 'order' | 'restock' | 'manual' | 'stocktake'
// `delta` is always in whole units. For a sub-divided ingredient an order can
// consume 0 units (served from the already-opened one), so `subDelta` records
// what was really used.
export interface InventoryAdjustment { id: string; timestamp: number; ingredientId: string; delta: number; reason: AdjustmentReason; orderId?: string; subDelta?: number }
export interface FinanceExpense {
  id: string
  date: string
  timestamp: number
  category: ExpenseCategory
  vendor: string
  description: string
  amountQar: number
  paymentMethod: string
  reference?: string
  notes?: string
  source: 'manual' | 'excel'
  createdAt: number
  updatedAt: number
}
export interface FinanceReceipt {
  id: string
  uploadedAt: number
  fileName: string
  mimeType: string
  size: number
  dataUrl: string
  notes?: string
}
export interface FinanceWastage {
  id: string
  date: string
  timestamp: number
  itemName: string
  qty?: number
  unit?: Unit | string
  amountQar?: number
  reason?: string
  notes?: string
  createdAt: number
  updatedAt: number
}
export interface MetaRow { key: string; value: unknown }
// An order that was deleted by an admin, kept for audit (never exported).
export interface DeletionLog { id: string; timestamp: number; reason: string; order: Order }
// A free-text supply/help request from a barista to the admin.
export interface Request { id: string; timestamp: number; message: string; from?: string; done?: boolean }

export const DB_NAME = 'qauto_cafe'
export const DB_VERSION = 7

export const STORES = ['departments','staff','ingredients','categories','menuItems','orders','inventoryAdjustments','deletionLogs','requests','financeExpenses','financeReceipts','financeWastages','meta'] as const
export type StoreName = typeof STORES[number]

// Local-only outbox of pending changes awaiting push to Supabase (DB v2).
export const OUTBOX_STORE = 'outbox'

// Which local stores sync to Supabase, and the table each maps to.
// `meta` is intentionally excluded — it holds per-device bookkeeping.
export const SYNC_TABLES: Partial<Record<StoreName, string>> = {
  departments: 'departments',
  staff: 'staff',
  ingredients: 'ingredients',
  categories: 'categories',
  menuItems: 'menu_items',
  orders: 'orders',
  inventoryAdjustments: 'inventory_adjustments',
  deletionLogs: 'deletion_logs',
  financeExpenses: 'finance_expenses',
  financeReceipts: 'finance_receipts',
  financeWastages: 'finance_wastages',
  // Requests are NOT synced through the local outbox — they live directly in
  // the shared Supabase `meta` table (see client.listRequests), so they appear
  // on every device without a dedicated table.
}

export type Outbox = { key: string; store: StoreName; id: string; op: 'put' | 'del'; record?: unknown; updatedAt: number }
