# Q-Auto Cafe POS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an offline, single-PC, touch-first cafe POS for Q-Auto with a barista panel (order entry tagged to staff/department + automatic recipe-driven inventory deduction) and a password-protected admin panel (inventory, menu/recipes, orders log, department charge-back billing, directory, backup/restore).

**Architecture:** React + Vite + TypeScript single-page app compiled to ONE self-contained `index.html` via `vite-plugin-singlefile`, run by double-clicking — no server, no internet. All state persists in IndexedDB (via `idb`). Pure domain logic (deduction, billing, search, CSV) is isolated from React and unit-tested with Vitest. Order placement and its inventory deductions run in a single IndexedDB transaction for consistency.

**Tech Stack:** React 18, Vite 5, TypeScript, `idb`, `vite-plugin-singlefile`, Vitest + @testing-library/react + fake-indexeddb, Montserrat (self-hosted).

---

## File Structure

```
qauto-cafe/                      # app root (created in Task 0)
  index.html                     # Vite entry
  package.json vite.config.ts tsconfig.json vitest.config.ts
  public/fonts/                  # Montserrat .woff2 (self-hosted)
  src/
    main.tsx                     # React bootstrap
    app/
      App.tsx                    # shell: barista by default, admin route behind gate
      AdminGate.tsx              # password prompt
      routes.ts                  # view constants
    db/
      schema.ts                  # types + DB name/version + store names
      database.ts                # openDB, upgrade/migrations
      repo.ts                    # typed CRUD accessors per store
      backup.ts                  # export/import whole DB <-> JSON
      seed.ts                    # first-run seed loader
    domain/
      deduction.ts               # computeDeductions(order, items) -> adjustments
      billing.ts                 # aggregateBilling(orders, ...) -> report
      search.ts                  # matchStaff(query, staff) -> ranked results
      csv.ts                     # toCsv(rows) helper + report formatters
      money.ts                   # formatQar()
    features/
      barista/
        BaristaPanel.tsx         # layout: source + menu + ticket
        SourcePicker.tsx         # search box + department buttons
        MenuGrid.tsx             # category tiles -> item tiles
        Ticket.tsx               # running order, totals, place order
        useTicket.ts             # ticket state hook
        placeOrder.ts            # transactional order + deduction write
      admin/
        AdminPanel.tsx           # admin shell + section nav
        Dashboard.tsx
        InventoryScreen.tsx
        MenuRecipesScreen.tsx
        OrdersLogScreen.tsx
        BillingScreen.tsx
        DirectoryScreen.tsx
        BackupScreen.tsx
    components/
      Tile.tsx Modal.tsx Toast.tsx NumberField.tsx DataTable.tsx Stepper.tsx
      CrudList.tsx               # reusable list+edit pattern (DRY admin CRUD)
    styles/
      theme.css                  # tokens (colors, Montserrat), globals
  scripts/
    build-seed.mjs               # parses the .xlsx -> src/db/seed.data.json (dev-time)
  seed-source/
    Q-Auto Directory 2026.xlsx   # copied from uploads for the seed script
```

**Responsibilities:** `db/` owns persistence only. `domain/` is pure (no React, no IndexedDB) and holds all calculation/logic. `features/` compose domain + db + UI. `components/` are presentational and reused (notably `CrudList` keeps the six admin screens DRY).

---

## Conventions (read before any task)

- **IDs:** string UUIDs via `crypto.randomUUID()`.
- **Units:** ingredient `unit` ∈ `'ml' | 'g' | 'pcs' | 'shot'`.
- **Money:** integers are QAR with 2 decimals stored as `number` (e.g. `7.5`). Format via `formatQar`.
- **Tests:** Vitest. DB tests use `fake-indexeddb`. Run a single test file with `npm test -- <path>`. Run all with `npm test`. `-- --run` forces non-watch.
- **Commits:** conventional commits, one per task step that says "Commit".
- **TDD:** failing test → run (fails) → minimal impl → run (passes) → commit.

---

## Task 0: Project scaffold

**Files:**
- Create: `qauto-cafe/package.json`, `vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/theme.css`
- Create: `qauto-cafe/.gitignore`

- [ ] **Step 1: Scaffold Vite React-TS project**

Run (from repo root `C:\Users\ASUS\Desktop\Qauto pos`):
```bash
npm create vite@latest qauto-cafe -- --template react-ts
cd qauto-cafe
npm install
npm install idb
npm install -D vite-plugin-singlefile vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb
```
Expected: `qauto-cafe/` created, dependencies installed.

- [ ] **Step 2: Configure Vite for single-file output**

Replace `qauto-cafe/vite.config.ts`:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2018', assetsInlineLimit: 100000000, cssCodeSplit: false },
})
```

- [ ] **Step 3: Configure Vitest**

Create `qauto-cafe/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
```
Create `qauto-cafe/src/test-setup.ts`:
```ts
import '@testing-library/jest-dom'
import 'fake-indexeddb/auto'
```
Add to `package.json` "scripts": `"test": "vitest"`, `"build": "vite build"`.

- [ ] **Step 4: Add theme tokens + Montserrat**

Download Montserrat 400/600/700 `.woff2` into `qauto-cafe/public/fonts/` (e.g. from the `@fontsource/montserrat` package: `npm i @fontsource/montserrat` then copy `node_modules/@fontsource/montserrat/files/montserrat-latin-{400,600,700}-normal.woff2` into `public/fonts/`).

Create `qauto-cafe/src/styles/theme.css`:
```css
@font-face { font-family:'Montserrat'; font-weight:400; src:url('/fonts/montserrat-latin-400-normal.woff2') format('woff2'); font-display:swap; }
@font-face { font-family:'Montserrat'; font-weight:600; src:url('/fonts/montserrat-latin-600-normal.woff2') format('woff2'); font-display:swap; }
@font-face { font-family:'Montserrat'; font-weight:700; src:url('/fonts/montserrat-latin-700-normal.woff2') format('woff2'); font-display:swap; }

:root{
  --bg:#0E0F11; --surface:#FFFFFF; --ink:#16181C; --muted:#6B7280;
  --accent:#32D282; --accent-ink:#0B3D2C; --danger:#E5484D; --line:#E5E7EB;
  --radius:14px; --tap:48px;
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;font-family:'Montserrat',system-ui,sans-serif;color:var(--ink);background:var(--bg)}
button{font-family:inherit;cursor:pointer;min-height:var(--tap)}
:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
```

- [ ] **Step 5: Minimal App + bootstrap**

Replace `qauto-cafe/src/main.tsx`:
```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles/theme.css'
import App from './app/App'

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
```
Replace `qauto-cafe/src/app/App.tsx`:
```tsx
export default function App() {
  return <div style={{ padding: 24, color: '#fff' }}>Q-Auto Cafe POS</div>
}
```
Delete `src/App.css`, `src/index.css`, `src/assets` if present and referenced; remove their imports.

- [ ] **Step 6: Verify dev + single-file build**

Run: `npm run build`
Expected: `dist/index.html` produced; opening it directly (double-click / `file://`) shows "Q-Auto Cafe POS". Confirm `dist/` contains essentially just `index.html` (JS/CSS inlined).

- [ ] **Step 7: Commit**

Create `qauto-cafe/.gitignore` with these two lines:
```
node_modules/
dist/
```
Then:
```bash
cd "C:\Users\ASUS\Desktop\Qauto pos"
git add qauto-cafe docs
git commit -m "chore: scaffold Vite React-TS single-file app with theme + tests"
```

---

## Task 1: Database schema & types

**Files:**
- Create: `src/db/schema.ts`

- [ ] **Step 1: Define types and store names**

Create `qauto-cafe/src/db/schema.ts`:
```ts
export type Unit = 'ml' | 'g' | 'pcs' | 'shot'

export interface Department { id: string; name: string; mainExtension: string; active: boolean }
export interface Staff { id: string; name: string; position: string; email: string; extension: string; departmentId: string; active: boolean }
export interface Ingredient { id: string; name: string; unit: Unit; stockQty: number; lowStockThreshold: number }
export interface Category { id: string; name: string; sortOrder: number }
export interface RecipeLine { ingredientId: string; qty: number }
export interface MenuItem { id: string; name: string; categoryId: string; price: number; active: boolean; recipe: RecipeLine[] }
export interface OrderLine { itemId: string; name: string; qty: number; unitPrice: number }
export interface Order { id: string; timestamp: number; staffId: string | null; departmentId: string | null; lines: OrderLine[]; total: number; note?: string }
export type AdjustmentReason = 'order' | 'restock' | 'manual' | 'stocktake'
export interface InventoryAdjustment { id: string; timestamp: number; ingredientId: string; delta: number; reason: AdjustmentReason; orderId?: string }
export interface MetaRow { key: string; value: unknown }

export const DB_NAME = 'qauto_cafe'
export const DB_VERSION = 1

export const STORES = ['departments','staff','ingredients','categories','menuItems','orders','inventoryAdjustments','meta'] as const
export type StoreName = typeof STORES[number]
```

- [ ] **Step 2: Commit**
```bash
git add src/db/schema.ts && git commit -m "feat(db): define schema types and store names"
```

---

## Task 2: Open database & migrations

**Files:**
- Create: `src/db/database.ts`
- Test: `src/db/database.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/db/database.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { getDb } from './database'
import { STORES } from './schema'

describe('database', () => {
  it('creates all object stores', async () => {
    const db = await getDb()
    for (const s of STORES) expect(db.objectStoreNames.contains(s)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/db/database.test.ts --run`
Expected: FAIL — cannot find module `./database`.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/db/database.ts`:
```ts
import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION } from './schema'

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('departments')) db.createObjectStore('departments', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('staff')) {
          const s = db.createObjectStore('staff', { keyPath: 'id' })
          s.createIndex('extension', 'extension'); s.createIndex('departmentId', 'departmentId')
        }
        if (!db.objectStoreNames.contains('ingredients')) db.createObjectStore('ingredients', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('categories')) db.createObjectStore('categories', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('menuItems')) {
          const m = db.createObjectStore('menuItems', { keyPath: 'id' }); m.createIndex('categoryId', 'categoryId')
        }
        if (!db.objectStoreNames.contains('orders')) {
          const o = db.createObjectStore('orders', { keyPath: 'id' }); o.createIndex('timestamp', 'timestamp')
        }
        if (!db.objectStoreNames.contains('inventoryAdjustments')) {
          const a = db.createObjectStore('inventoryAdjustments', { keyPath: 'id' }); a.createIndex('ingredientId', 'ingredientId')
        }
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

export function resetDbCache() { dbPromise = null } // test helper
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/db/database.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/db/database.ts src/db/database.test.ts && git commit -m "feat(db): open IndexedDB with stores and indexes"
```

---

## Task 3: Typed repository (CRUD)

**Files:**
- Create: `src/db/repo.ts`
- Test: `src/db/repo.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/db/repo.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'

beforeEach(async () => { await repo.clearAll() })

describe('repo', () => {
  it('puts and gets a record', async () => {
    await repo.put('ingredients', { id: 'a', name: 'Milk', unit: 'ml', stockQty: 1000, lowStockThreshold: 200 })
    const got = await repo.get('ingredients', 'a')
    expect(got?.name).toBe('Milk')
  })
  it('lists all records', async () => {
    await repo.put('categories', { id: 'c1', name: 'Hot Drinks', sortOrder: 1 })
    await repo.put('categories', { id: 'c2', name: 'Tea', sortOrder: 2 })
    expect((await repo.all('categories')).length).toBe(2)
  })
  it('deletes a record', async () => {
    await repo.put('categories', { id: 'c1', name: 'X', sortOrder: 1 })
    await repo.remove('categories', 'c1')
    expect(await repo.get('categories', 'c1')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/db/repo.test.ts --run`
Expected: FAIL — cannot find `./repo`.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/db/repo.ts`:
```ts
import { getDb } from './database'
import { STORES, type StoreName } from './schema'

export const repo = {
  async all<T = any>(store: StoreName): Promise<T[]> { return (await getDb()).getAll(store) as Promise<T[]> },
  async get<T = any>(store: StoreName, id: string): Promise<T | undefined> { return (await getDb()).get(store, id) as Promise<T | undefined> },
  async put<T = any>(store: StoreName, value: T): Promise<void> { await (await getDb()).put(store, value as any) },
  async putMany<T = any>(store: StoreName, values: T[]): Promise<void> {
    const db = await getDb(); const tx = db.transaction(store, 'readwrite')
    await Promise.all(values.map(v => tx.store.put(v as any))); await tx.done
  },
  async remove(store: StoreName, id: string): Promise<void> { await (await getDb()).delete(store, id) },
  async clear(store: StoreName): Promise<void> { await (await getDb()).clear(store) },
  async clearAll(): Promise<void> { for (const s of STORES) await (await getDb()).clear(s) },
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/db/repo.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/db/repo.ts src/db/repo.test.ts && git commit -m "feat(db): typed repository CRUD accessors"
```

---

## Task 4: Domain — recipe deduction (pure)

**Files:**
- Create: `src/domain/deduction.ts`
- Test: `src/domain/deduction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/domain/deduction.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { computeDeductions } from './deduction'
import type { MenuItem, OrderLine } from '../db/schema'

const items: MenuItem[] = [
  { id: 'latte', name: 'Latte', categoryId: 'h', price: 10, active: true, recipe: [ { ingredientId: 'milk', qty: 250 }, { ingredientId: 'beans', qty: 18 } ] },
  { id: 'water', name: 'Water', categoryId: 's', price: 3, active: true, recipe: [] },
]

describe('computeDeductions', () => {
  it('multiplies recipe qty by line qty and sums per ingredient', () => {
    const lines: OrderLine[] = [ { itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 10 } ]
    const d = computeDeductions(lines, items)
    expect(d).toEqual({ milk: 500, beans: 36 })
  })
  it('ignores items with no recipe', () => {
    const lines: OrderLine[] = [ { itemId: 'water', name: 'Water', qty: 1, unitPrice: 3 } ]
    expect(computeDeductions(lines, items)).toEqual({})
  })
  it('aggregates a shared ingredient across multiple items', () => {
    const more: MenuItem[] = [ ...items, { id: 'cap', name: 'Cappuccino', categoryId: 'h', price: 10, active: true, recipe: [ { ingredientId: 'milk', qty: 150 } ] } ]
    const lines: OrderLine[] = [ { itemId: 'latte', name: 'Latte', qty: 1, unitPrice: 10 }, { itemId: 'cap', name: 'Cappuccino', qty: 1, unitPrice: 10 } ]
    expect(computeDeductions(lines, more).milk).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/domain/deduction.test.ts --run`
Expected: FAIL — cannot find `./deduction`.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/domain/deduction.ts`:
```ts
import type { MenuItem, OrderLine } from '../db/schema'

/** Returns a map of ingredientId -> total quantity to deduct for the given order lines. */
export function computeDeductions(lines: OrderLine[], items: MenuItem[]): Record<string, number> {
  const byId = new Map(items.map(i => [i.id, i]))
  const out: Record<string, number> = {}
  for (const line of lines) {
    const item = byId.get(line.itemId)
    if (!item) continue
    for (const r of item.recipe) {
      out[r.ingredientId] = (out[r.ingredientId] ?? 0) + r.qty * line.qty
    }
  }
  return out
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/domain/deduction.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/domain/deduction.ts src/domain/deduction.test.ts && git commit -m "feat(domain): pure recipe deduction calculation"
```

---

## Task 5: Domain — money + ticket totals (pure)

**Files:**
- Create: `src/domain/money.ts`
- Test: `src/domain/money.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/domain/money.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { formatQar, ticketTotal } from './money'
import type { OrderLine } from '../db/schema'

describe('money', () => {
  it('formats QAR with 2 decimals', () => { expect(formatQar(7.5)).toBe('QAR 7.50') })
  it('sums line totals', () => {
    const lines: OrderLine[] = [ { itemId: 'a', name: 'A', qty: 2, unitPrice: 10 }, { itemId: 'b', name: 'B', qty: 1, unitPrice: 3.5 } ]
    expect(ticketTotal(lines)).toBe(23.5)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/domain/money.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/domain/money.ts`:
```ts
import type { OrderLine } from '../db/schema'

export function formatQar(n: number): string { return `QAR ${n.toFixed(2)}` }
export function ticketTotal(lines: OrderLine[]): number {
  return Math.round(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0) * 100) / 100
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/domain/money.test.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add src/domain/money.ts src/domain/money.test.ts && git commit -m "feat(domain): QAR formatting and ticket totals"
```

---

## Task 6: Domain — staff search (pure)

**Files:**
- Create: `src/domain/search.ts`
- Test: `src/domain/search.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/domain/search.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { matchStaff } from './search'
import type { Staff } from '../db/schema'

const staff: Staff[] = [
  { id: '1', name: 'Ahmed Shariefi', position: 'CEO', email: 'a@q.com', extension: '44452 (302)', departmentId: 'd1', active: true },
  { id: '2', name: 'Anu Vasu', position: 'Accountant', email: 'av@q.com', extension: '44452 (307)', departmentId: 'd2', active: true },
]

describe('matchStaff', () => {
  it('matches by extension digits, ignoring formatting', () => {
    expect(matchStaff('302', staff).map(s => s.id)).toEqual(['1'])
  })
  it('matches by name, case-insensitive substring', () => {
    expect(matchStaff('anu', staff).map(s => s.id)).toEqual(['2'])
  })
  it('returns [] for blank query', () => { expect(matchStaff('  ', staff)).toEqual([]) })
  it('excludes inactive staff', () => {
    const s2 = [{ ...staff[0], active: false }]
    expect(matchStaff('302', s2)).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/domain/search.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/domain/search.ts`:
```ts
import type { Staff } from '../db/schema'

const digits = (s: string) => s.replace(/\D/g, '')

export function matchStaff(query: string, staff: Staff[], limit = 8): Staff[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qd = digits(q)
  return staff.filter(s => {
    if (!s.active) return false
    const byName = s.name.toLowerCase().includes(q)
    const byExt = qd.length > 0 && digits(s.extension).includes(qd)
    return byName || byExt
  }).slice(0, limit)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/domain/search.test.ts --run`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**
```bash
git add src/domain/search.ts src/domain/search.test.ts && git commit -m "feat(domain): staff search by extension or name"
```

---

## Task 7: Domain — billing aggregation (pure)

**Files:**
- Create: `src/domain/billing.ts`
- Test: `src/domain/billing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/domain/billing.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { aggregateBilling } from './billing'
import type { Order } from '../db/schema'

const orders: Order[] = [
  { id: 'o1', timestamp: 1000, staffId: 's1', departmentId: 'd1', total: 10, lines: [] },
  { id: 'o2', timestamp: 2000, staffId: 's2', departmentId: 'd1', total: 5, lines: [] },
  { id: 'o3', timestamp: 3000, staffId: 's3', departmentId: 'd2', total: 7, lines: [] },
  { id: 'o4', timestamp: 9999, staffId: null, departmentId: null, total: 4, lines: [] },
]

describe('aggregateBilling', () => {
  it('totals per department with per-person breakdown', () => {
    const r = aggregateBilling(orders, { from: 0, to: 5000 })
    const d1 = r.departments.find(d => d.departmentId === 'd1')!
    expect(d1.total).toBe(15)
    expect(d1.orderCount).toBe(2)
    expect(d1.byPerson.find(p => p.staffId === 's1')!.total).toBe(10)
  })
  it('filters by date range (inclusive from, exclusive to)', () => {
    const r = aggregateBilling(orders, { from: 0, to: 5000 })
    expect(r.departments.some(d => d.departmentId === null)).toBe(false) // o4 at 9999 excluded
  })
  it('groups null department under an Unassigned bucket id', () => {
    const r = aggregateBilling(orders, { from: 0, to: 100000 })
    expect(r.departments.find(d => d.departmentId === null)!.total).toBe(4)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/domain/billing.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/domain/billing.ts`:
```ts
import type { Order } from '../db/schema'

export interface PersonTotal { staffId: string | null; total: number; orderCount: number }
export interface DepartmentTotal { departmentId: string | null; total: number; orderCount: number; byPerson: PersonTotal[] }
export interface BillingReport { from: number; to: number; departments: DepartmentTotal[]; grandTotal: number }
export interface DateRange { from: number; to: number } // [from, to)

export function aggregateBilling(orders: Order[], range: DateRange): BillingReport {
  const inRange = orders.filter(o => o.timestamp >= range.from && o.timestamp < range.to)
  const deptMap = new Map<string | null, { total: number; count: number; people: Map<string | null, PersonTotal> }>()
  for (const o of inRange) {
    if (!deptMap.has(o.departmentId)) deptMap.set(o.departmentId, { total: 0, count: 0, people: new Map() })
    const d = deptMap.get(o.departmentId)!
    d.total = Math.round((d.total + o.total) * 100) / 100; d.count++
    const p = d.people.get(o.staffId) ?? { staffId: o.staffId, total: 0, orderCount: 0 }
    p.total = Math.round((p.total + o.total) * 100) / 100; p.orderCount++
    d.people.set(o.staffId, p)
  }
  const departments: DepartmentTotal[] = [...deptMap.entries()].map(([departmentId, d]) => ({
    departmentId, total: d.total, orderCount: d.count,
    byPerson: [...d.people.values()].sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total)
  const grandTotal = Math.round(departments.reduce((s, d) => s + d.total, 0) * 100) / 100
  return { from: range.from, to: range.to, departments, grandTotal }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/domain/billing.test.ts --run`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add src/domain/billing.ts src/domain/billing.test.ts && git commit -m "feat(domain): department + per-person billing aggregation"
```

---

## Task 8: Domain — CSV export (pure)

**Files:**
- Create: `src/domain/csv.ts`
- Test: `src/domain/csv.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/domain/csv.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('builds header + rows', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
    expect(csv).toBe('a,b\r\n1,x\r\n2,y')
  })
  it('quotes values containing comma, quote, or newline', () => {
    const csv = toCsv([{ name: 'Doe, John', note: 'say "hi"' }])
    expect(csv).toBe('name,note\r\n"Doe, John","say ""hi"""')
  })
  it('returns empty string for empty input', () => { expect(toCsv([])).toBe('') })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/domain/csv.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/domain/csv.ts`:
```ts
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
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/domain/csv.test.ts --run`
Expected: PASS (3 tests). (`downloadText` is exercised via UI, not unit-tested.)

- [ ] **Step 5: Commit**
```bash
git add src/domain/csv.ts src/domain/csv.test.ts && git commit -m "feat(domain): CSV serialization + download helper"
```

---

## Task 9: Backup / restore

**Files:**
- Create: `src/db/backup.ts`
- Test: `src/db/backup.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/db/backup.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'
import { exportAll, importAll } from './backup'

beforeEach(async () => { await repo.clearAll() })

describe('backup', () => {
  it('round-trips all stores', async () => {
    await repo.put('ingredients', { id: 'm', name: 'Milk', unit: 'ml', stockQty: 500, lowStockThreshold: 100 })
    await repo.put('categories', { id: 'c', name: 'Hot', sortOrder: 1 })
    const dump = await exportAll()
    await repo.clearAll()
    expect(await repo.all('ingredients')).toHaveLength(0)
    await importAll(dump)
    expect((await repo.get('ingredients', 'm'))!.name).toBe('Milk')
    expect(await repo.all('categories')).toHaveLength(1)
  })
  it('export includes a version and timestamp', async () => {
    const dump = await exportAll()
    expect(dump.version).toBeDefined()
    expect(typeof dump.exportedAt).toBe('number')
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/db/backup.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/db/backup.ts`:
```ts
import { repo } from './repo'
import { STORES, DB_VERSION, type StoreName } from './schema'

export interface Backup { version: number; exportedAt: number; data: Record<string, unknown[]> }

export async function exportAll(): Promise<Backup> {
  const data: Record<string, unknown[]> = {}
  for (const s of STORES) data[s] = await repo.all(s)
  return { version: DB_VERSION, exportedAt: Date.now(), data }
}

export async function importAll(backup: Backup): Promise<void> {
  for (const s of STORES) {
    await repo.clear(s)
    const rows = backup.data[s] ?? []
    if (rows.length) await repo.putMany(s as StoreName, rows)
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/db/backup.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/db/backup.ts src/db/backup.test.ts && git commit -m "feat(db): full database backup and restore"
```

---

## Task 10: Build the seed data file from the directory + menu

**Files:**
- Create: `scripts/build-seed.mjs`
- Create: `seed-source/Q-Auto Directory 2026.xlsx` (copied from uploads)
- Create (generated): `src/db/seed.data.json`

- [ ] **Step 1: Copy the source spreadsheet**

Run (from repo root):
```bash
mkdir -p qauto-cafe/seed-source
cp "C:\Users\ASUS\Desktop\qauto matieral\Q-Auto Directory 2026.xlsx" qauto-cafe/seed-source/
```

- [ ] **Step 2: Write the seed builder script**

Create `qauto-cafe/scripts/build-seed.mjs`. It parses the xlsx (no external deps — raw XML, since openpyxl/SheetJS can choke on the embedded drawing), derives departments from ALL-CAPS section headers, and emits departments + staff. It also appends a fixed menu/ingredient/category seed.

```js
import { readFileSync, writeFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'   // npm i -D fflate
import { randomUUID } from 'node:crypto'

const NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
const buf = readFileSync(new URL('../seed-source/Q-Auto Directory 2026.xlsx', import.meta.url))
const zip = unzipSync(new Uint8Array(buf))
const xml = (p) => strFromU8(zip[p])

// shared strings
const ss = []
{
  const s = xml('xl/sharedStrings.xml')
  for (const m of s.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1])
    ss.push(decode(texts.join('')))
  }
}
function decode(s){return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#10;/g,'\n').replace(/&apos;/g,"'")}

// workbook sheet -> target
const rels = {}
for (const m of xml('xl/_rels/workbook.xml.rels').matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rels[m[1]] = m[2]
const sheets = []
for (const m of xml('xl/workbook.xml').matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) sheets.push([decode(m[1]), rels[m[2]]])

function readSheet(target){
  const s = xml('xl/' + target)
  const rows = {}
  for (const c of s.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(?:t="([^"]+)")?[^>]*>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g)) {
    const [, col, row, t, v] = c
    let val = ''
    if (v != null) val = t === 's' ? ss[+v] : decode(v)
    ;(rows[row] ||= {})[col] = val
  }
  return rows
}

const departments = []
const staff = []
const deptByName = new Map()
function deptId(name){
  if (!deptByName.has(name)) { const id = randomUUID(); deptByName.set(name, id); departments.push({ id, name: titleCase(name), mainExtension: '', active: true }) }
  return deptByName.get(name)
}
function titleCase(s){ return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/Departmemt|Deparment|Deparmtent/i,'Department') }

for (const [name, target] of sheets) {
  if (name === 'Q Auto Directory' || !target) continue
  const rows = readSheet(target)
  let cur = null
  for (const r of Object.keys(rows).map(Number).sort((a,b)=>a-b)) {
    const A=(rows[r].A||'').trim(), B=(rows[r].B||'').trim(), D=(rows[r].D||'').trim(), E=(rows[r].E||'').trim()
    if (A && !B && !D && A === A.toUpperCase() && A.length > 3 && A.toLowerCase() !== 'name') cur = A
    else if (A && (D || E) && A.toLowerCase() !== 'name') {
      staff.push({ id: randomUUID(), name: A, position: B, email: D, extension: E, departmentId: deptId(cur || name), active: true })
    }
  }
}

// ---- Fixed menu seed (placeholders; editable in admin) ----
const ing = (name, unit, stockQty, low) => ({ id: randomUUID(), name, unit, stockQty, lowStockThreshold: low })
const ingredients = [
  ing('Milk','ml',5000,1000), ing('Coffee Beans','g',2000,300), ing('Tea Bags','pcs',200,30),
  ing('Sugar','g',3000,500), ing('Chocolate Syrup','ml',1000,200), ing('Vanilla Syrup','ml',1000,200),
  ing('Ice','g',10000,2000), ing('Mint Leaves','g',300,50), ing('Lime','pcs',100,15),
  ing('Soda Water','ml',5000,1000), ing('Orange','pcs',100,15), ing('Paper Cup 8oz','pcs',500,50),
  ing('Paper Cup 12oz','pcs',500,50), ing('Protein Bar Unit','pcs',100,20), ing('Croissant','pcs',60,10),
]
const ingId = (n) => ingredients.find(i => i.name === n).id
const cat = (name, sortOrder) => ({ id: randomUUID(), name, sortOrder })
const categories = [
  cat('Hot Drinks',1), cat('Iced Drinks',2), cat('Tea',3), cat('Mojitos',4),
  cat('Fresh Juices',5), cat('Soft Drinks',6), cat('Pastries',7), cat('Protein Bars',8),
]
const catId = (n) => categories.find(c => c.name === n).id
const item = (name, catName, price, recipe) => ({ id: randomUUID(), name, categoryId: catId(catName), price, active: true, recipe })
const menuItems = [
  item('Latte','Hot Drinks',12,[{ingredientId:ingId('Milk'),qty:250},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Cappuccino','Hot Drinks',12,[{ingredientId:ingId('Milk'),qty:150},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Espresso','Hot Drinks',8,[{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Turkish Coffee','Hot Drinks',10,[{ingredientId:ingId('Coffee Beans'),qty:14},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Iced Latte','Iced Drinks',14,[{ingredientId:ingId('Milk'),qty:200},{ingredientId:ingId('Coffee Beans'),qty:18},{ingredientId:ingId('Ice'),qty:150},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Green Tea','Tea',8,[{ingredientId:ingId('Tea Bags'),qty:1},{ingredientId:ingId('Paper Cup 8oz'),qty:1}]),
  item('Mint Lemonade Mojito','Mojitos',15,[{ingredientId:ingId('Mint Leaves'),qty:10},{ingredientId:ingId('Lime'),qty:1},{ingredientId:ingId('Soda Water'),qty:200},{ingredientId:ingId('Ice'),qty:150},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Fresh Orange Juice','Fresh Juices',16,[{ingredientId:ingId('Orange'),qty:3},{ingredientId:ingId('Paper Cup 12oz'),qty:1}]),
  item('Water','Soft Drinks',3,[]),
  item('Soft Drink Can','Soft Drinks',5,[]),
  item('Butter Croissant','Pastries',9,[{ingredientId:ingId('Croissant'),qty:1}]),
  item('Protein Bar','Protein Bars',14,[{ingredientId:ingId('Protein Bar Unit'),qty:1}]),
]

const seed = { departments, staff, ingredients, categories, menuItems }
writeFileSync(new URL('../src/db/seed.data.json', import.meta.url), JSON.stringify(seed, null, 2))
console.log(`Seed written: ${departments.length} departments, ${staff.length} staff, ${menuItems.length} items`)
```

- [ ] **Step 3: Install fflate and run the builder**

Run:
```bash
cd qauto-cafe
npm i -D fflate
node scripts/build-seed.mjs
```
Expected: prints e.g. `Seed written: 27 departments, 152 staff, 12 items` and creates `src/db/seed.data.json`.

- [ ] **Step 4: Commit**
```bash
git add scripts/build-seed.mjs src/db/seed.data.json package.json
git commit -m "feat(seed): generate departments+staff from directory and starter menu"
```
(Do NOT commit `seed-source/` if it contains private data you don't want in git — add `seed-source/` to `.gitignore` first if so.)

---

## Task 11: First-run seed loader

**Files:**
- Create: `src/db/seed.ts`
- Test: `src/db/seed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/db/seed.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from './repo'
import { seedIfEmpty } from './seed'

beforeEach(async () => { await repo.clearAll() })

describe('seedIfEmpty', () => {
  it('loads seed data on first run', async () => {
    await seedIfEmpty()
    expect((await repo.all('departments')).length).toBeGreaterThan(0)
    expect((await repo.all('menuItems')).length).toBeGreaterThan(0)
  })
  it('does not duplicate on second run', async () => {
    await seedIfEmpty()
    const n = (await repo.all('staff')).length
    await seedIfEmpty()
    expect((await repo.all('staff')).length).toBe(n)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/db/seed.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/db/seed.ts`:
```ts
import { repo } from './repo'
import seedData from './seed.data.json'
import type { Department, Staff, Ingredient, Category, MenuItem } from './schema'

const SEED_FLAG = 'seeded'

export async function seedIfEmpty(): Promise<void> {
  const flag = await repo.get('meta', SEED_FLAG)
  if (flag) return
  const d = seedData as unknown as {
    departments: Department[]; staff: Staff[]; ingredients: Ingredient[]; categories: Category[]; menuItems: MenuItem[]
  }
  await repo.putMany('departments', d.departments)
  await repo.putMany('staff', d.staff)
  await repo.putMany('ingredients', d.ingredients)
  await repo.putMany('categories', d.categories)
  await repo.putMany('menuItems', d.menuItems)
  await repo.put('meta', { key: SEED_FLAG, value: true })
}
```
Ensure `tsconfig.json` has `"resolveJsonModule": true` (Vite's default template does).

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/db/seed.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/db/seed.ts src/db/seed.test.ts tsconfig.json && git commit -m "feat(db): idempotent first-run seed loader"
```

---

## Task 12: Place-order transaction

**Files:**
- Create: `src/features/barista/placeOrder.ts`
- Test: `src/features/barista/placeOrder.test.ts`

- [ ] **Step 1: Write the failing test**

Create `qauto-cafe/src/features/barista/placeOrder.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { repo } from '../../db/repo'
import { placeOrder } from './placeOrder'
import type { MenuItem, Ingredient } from '../../db/schema'

const milk: Ingredient = { id: 'milk', name: 'Milk', unit: 'ml', stockQty: 500, lowStockThreshold: 100 }
const latte: MenuItem = { id: 'latte', name: 'Latte', categoryId: 'h', price: 12, active: true, recipe: [{ ingredientId: 'milk', qty: 250 }] }

beforeEach(async () => {
  await repo.clearAll()
  await repo.put('ingredients', { ...milk })
  await repo.put('menuItems', latte)
})

describe('placeOrder', () => {
  it('writes the order, deducts inventory, and records adjustments', async () => {
    const { order } = await placeOrder({
      staffId: 's1', departmentId: 'd1',
      lines: [{ itemId: 'latte', name: 'Latte', qty: 2, unitPrice: 12 }],
    })
    expect(order.total).toBe(24)
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(0) // 500 - 250*2
    const adj = await repo.all('inventoryAdjustments')
    expect(adj).toHaveLength(1)
    expect(adj[0]).toMatchObject({ ingredientId: 'milk', delta: -500, reason: 'order', orderId: order.id })
  })
  it('allows negative stock but still records the order', async () => {
    await placeOrder({ staffId: null, departmentId: null, lines: [{ itemId: 'latte', name: 'Latte', qty: 3, unitPrice: 12 }] })
    expect((await repo.get('ingredients', 'milk'))!.stockQty).toBe(-250) // 500 - 750
    expect(await repo.all('orders')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/features/barista/placeOrder.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `qauto-cafe/src/features/barista/placeOrder.ts`:
```ts
import { getDb } from '../../db/database'
import { computeDeductions } from '../../domain/deduction'
import { ticketTotal } from '../../domain/money'
import type { Order, OrderLine, MenuItem, Ingredient, InventoryAdjustment } from '../../db/schema'

export interface PlaceOrderInput { staffId: string | null; departmentId: string | null; lines: OrderLine[]; note?: string }

export async function placeOrder(input: PlaceOrderInput): Promise<{ order: Order }> {
  const db = await getDb()
  const items = (await db.getAll('menuItems')) as MenuItem[]
  const deductions = computeDeductions(input.lines, items)
  const order: Order = {
    id: crypto.randomUUID(), timestamp: Date.now(),
    staffId: input.staffId, departmentId: input.departmentId,
    lines: input.lines, total: ticketTotal(input.lines), note: input.note,
  }
  const tx = db.transaction(['orders', 'ingredients', 'inventoryAdjustments'], 'readwrite')
  await tx.objectStore('orders').put(order)
  const ingStore = tx.objectStore('ingredients')
  const adjStore = tx.objectStore('inventoryAdjustments')
  for (const [ingredientId, qty] of Object.entries(deductions)) {
    const ing = (await ingStore.get(ingredientId)) as Ingredient | undefined
    if (!ing) continue
    ing.stockQty = Math.round((ing.stockQty - qty) * 1000) / 1000
    await ingStore.put(ing)
    const adj: InventoryAdjustment = { id: crypto.randomUUID(), timestamp: order.timestamp, ingredientId, delta: -qty, reason: 'order', orderId: order.id }
    await adjStore.put(adj)
  }
  await tx.done
  return { order }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/barista/placeOrder.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**
```bash
git add src/features/barista/placeOrder.ts src/features/barista/placeOrder.test.ts && git commit -m "feat(barista): transactional place-order with inventory deduction"
```

---

## Task 13: Shared UI components

**Files:**
- Create: `src/components/Toast.tsx`, `src/components/Modal.tsx`, `src/components/Stepper.tsx`, `src/components/DataTable.tsx`, `src/components/CrudList.tsx`

- [ ] **Step 1: Toast provider**

Create `qauto-cafe/src/components/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = { id: number; msg: string; kind: 'ok' | 'warn' }
const Ctx = createContext<(msg: string, kind?: 'ok' | 'warn') => void>(() => {})
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, kind: 'ok' | 'warn' = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  return (
    <Ctx.Provider value={push}>
      {children}
      <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'grid', gap: 8, zIndex: 1000 }}>
        {toasts.map(t => (
          <div key={t.id} role="status" style={{ background: t.kind === 'ok' ? 'var(--accent)' : 'var(--danger)', color: '#06231a', padding: '12px 20px', borderRadius: 'var(--radius)', fontWeight: 600, boxShadow: '0 6px 24px rgba(0,0,0,.25)' }}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
```

- [ ] **Step 2: Modal**

Create `qauto-cafe/src/components/Modal.tsx`:
```tsx
import type { ReactNode } from 'react'

export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!open) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'grid', placeItems: 'center', zIndex: 900 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label={title} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 24, width: 'min(560px, 92vw)', maxHeight: '88vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 22 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', fontSize: 24 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Stepper (qty +/-)**

Create `qauto-cafe/src/components/Stepper.tsx`:
```tsx
export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const btn = { width: 40, height: 40, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', fontSize: 20, fontWeight: 700 } as const
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button style={btn} aria-label="decrease" onClick={() => onChange(Math.max(min, value - 1))}>–</button>
      <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700 }}>{value}</span>
      <button style={btn} aria-label="increase" onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}
```

- [ ] **Step 4: DataTable**

Create `qauto-cafe/src/components/DataTable.tsx`:
```tsx
import type { ReactNode } from 'react'

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode }
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
      <thead>
        <tr>{columns.map(c => <th key={c.key} style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--line)', color: 'var(--muted)' }}>{c.header}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>{columns.map(c => <td key={c.key} style={{ padding: '10px 12px', borderBottom: '1px solid var(--line)' }}>{c.render ? c.render(r) : String((r as any)[c.key] ?? '')}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}
```

- [ ] **Step 5: CrudList (reusable admin list+add+edit+delete)**

Create `qauto-cafe/src/components/CrudList.tsx`:
```tsx
import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'

export interface Field { name: string; label: string; type?: 'text' | 'number' | 'select'; options?: { value: string; label: string }[] }

export function CrudList<T extends { id: string }>(props: {
  title: string
  rows: T[]
  fields: Field[]
  rowLabel: (r: T) => ReactNode
  empty: () => Omit<T, 'id'>
  onSave: (row: T) => Promise<void>
  onDelete: (id: string) => Promise<void>
}) {
  const { title, rows, fields, rowLabel, empty, onSave, onDelete } = props
  const [editing, setEditing] = useState<any | null>(null)
  const open = (r?: T) => setEditing(r ? { ...r } : { id: '', ...empty() })
  const save = async () => {
    const row = { ...editing, id: editing.id || crypto.randomUUID() }
    for (const f of fields) if (f.type === 'number') row[f.name] = Number(row[f.name] ?? 0)
    await onSave(row); setEditing(null)
  }
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <button onClick={() => open()} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '10px 18px', fontWeight: 700 }}>+ Add</button>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff', borderRadius: 10, padding: '10px 14px', border: '1px solid var(--line)' }}>
            <div>{rowLabel(r)}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => open(r)} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 8, padding: '6px 12px' }}>Edit</button>
              <button onClick={() => onDelete(r.id)} style={{ border: '1px solid var(--danger)', color: 'var(--danger)', background: '#fff', borderRadius: 8, padding: '6px 12px' }}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      <Modal open={!!editing} title={title} onClose={() => setEditing(null)}>
        {editing && (
          <div style={{ display: 'grid', gap: 12 }}>
            {fields.map(f => (
              <label key={f.name} style={{ display: 'grid', gap: 4, fontWeight: 600 }}>{f.label}
                {f.type === 'select'
                  ? <select value={editing[f.name] ?? ''} onChange={e => setEditing({ ...editing, [f.name]: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)' }}>
                      <option value="">—</option>
                      {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  : <input type={f.type === 'number' ? 'number' : 'text'} value={editing[f.name] ?? ''} onChange={e => setEditing({ ...editing, [f.name]: e.target.value })} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)' }} />}
              </label>
            ))}
            <button onClick={save} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700 }}>Save</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
```

- [ ] **Step 6: Commit**
```bash
git add src/components && git commit -m "feat(ui): shared Toast, Modal, Stepper, DataTable, CrudList"
```

---

## Task 14: App shell, data context, admin gate

**Files:**
- Create: `src/app/routes.ts`, `src/app/useData.ts`, `src/app/AdminGate.tsx`
- Modify: `src/app/App.tsx`
- Test: `src/app/AdminGate.test.tsx`

- [ ] **Step 1: Routes + data hook**

Create `qauto-cafe/src/app/routes.ts`:
```ts
export type View = 'barista' | 'admin'
```
Create `qauto-cafe/src/app/useData.ts` (loads & exposes all reference data, with refresh):
```ts
import { useCallback, useEffect, useState } from 'react'
import { repo } from '../db/repo'
import { seedIfEmpty } from '../db/seed'
import type { Department, Staff, Ingredient, Category, MenuItem } from '../db/schema'

export interface Data { departments: Department[]; staff: Staff[]; ingredients: Ingredient[]; categories: Category[]; menuItems: MenuItem[] }

export function useData() {
  const [data, setData] = useState<Data | null>(null)
  const refresh = useCallback(async () => {
    setData({
      departments: await repo.all('departments'),
      staff: await repo.all('staff'),
      ingredients: await repo.all('ingredients'),
      categories: await repo.all('categories'),
      menuItems: await repo.all('menuItems'),
    })
  }, [])
  useEffect(() => { (async () => { await seedIfEmpty(); await refresh() })() }, [refresh])
  return { data, refresh }
}
```

- [ ] **Step 2: Write the failing AdminGate test**

Create `qauto-cafe/src/app/AdminGate.test.tsx`:
```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { repo } from '../db/repo'
import { AdminGate } from './AdminGate'

beforeEach(async () => { await repo.clearAll() })

describe('AdminGate', () => {
  it('sets a password on first use then unlocks', async () => {
    const onUnlock = vi.fn()
    render(<AdminGate onUnlock={onUnlock} />)
    expect(await screen.findByText(/set admin password/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/password/i), 'cafe123')
    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    expect(onUnlock).toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Run to verify fail**

Run: `npm test -- src/app/AdminGate.test.tsx --run`
Expected: FAIL — cannot find `./AdminGate`.

- [ ] **Step 4: Implement AdminGate**

Create `qauto-cafe/src/app/AdminGate.tsx`:
```tsx
import { useEffect, useState } from 'react'
import { repo } from '../db/repo'

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export function AdminGate({ onUnlock }: { onUnlock: () => void }) {
  const [hash, setHash] = useState<string | null | undefined>(undefined)
  const [pwd, setPwd] = useState(''); const [err, setErr] = useState('')
  useEffect(() => { repo.get('meta', 'adminPwd').then(r => setHash((r?.value as string) ?? null)) }, [])
  if (hash === undefined) return null
  const submit = async () => {
    if (hash === null) { await repo.put('meta', { key: 'adminPwd', value: await sha256(pwd) }); onUnlock(); return }
    if (await sha256(pwd) === hash) onUnlock(); else setErr('Incorrect password')
  }
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
      <div style={{ background: 'var(--surface)', padding: 28, borderRadius: 'var(--radius)', width: 360, display: 'grid', gap: 12 }}>
        <h2 style={{ margin: 0 }}>{hash === null ? 'Set Admin Password' : 'Admin Login'}</h2>
        <label style={{ display: 'grid', gap: 4, fontWeight: 600 }}>Password
          <input aria-label="password" type="password" value={pwd} onChange={e => setPwd(e.target.value)} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--line)' }} />
        </label>
        {err && <div style={{ color: 'var(--danger)' }}>{err}</div>}
        <button onClick={submit} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Save</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npm test -- src/app/AdminGate.test.tsx --run`
Expected: PASS.

- [ ] **Step 6: Wire App shell**

Replace `qauto-cafe/src/app/App.tsx`:
```tsx
import { useState } from 'react'
import { ToastProvider } from '../components/Toast'
import { useData } from './useData'
import { AdminGate } from './AdminGate'
import type { View } from './routes'
import { BaristaPanel } from '../features/barista/BaristaPanel'
import { AdminPanel } from '../features/admin/AdminPanel'

export default function App() {
  const { data, refresh } = useData()
  const [view, setView] = useState<View>('barista')
  const [adminUnlocked, setAdminUnlocked] = useState(false)
  if (!data) return <div style={{ color: '#fff', padding: 24 }}>Loading…</div>
  return (
    <ToastProvider>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', color: '#fff' }}>
          <strong style={{ letterSpacing: 1 }}>Q-AUTO CAFE</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setView('barista')} style={tab(view === 'barista')}>Barista</button>
            <button onClick={() => { setView('admin') }} style={tab(view === 'admin')}>Admin ⚙</button>
          </div>
        </header>
        <main style={{ flex: 1, overflow: 'hidden' }}>
          {view === 'barista'
            ? <BaristaPanel data={data} onPlaced={refresh} />
            : adminUnlocked
              ? <AdminPanel data={data} refresh={refresh} />
              : <AdminGate onUnlock={() => setAdminUnlocked(true)} />}
        </main>
      </div>
    </ToastProvider>
  )
}
const tab = (active: boolean) => ({ background: active ? 'var(--accent)' : '#1c1e22', color: active ? '#06231a' : '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontWeight: 700 } as const)
```

- [ ] **Step 7: Commit**
```bash
git add src/app && git commit -m "feat(app): shell, data context, admin password gate"
```
(`BaristaPanel`/`AdminPanel` are created next; the app will not compile until Tasks 15–16. That's expected — commit the gate logic now; build verification happens after Task 16.)

---

## Task 15: Barista panel

**Files:**
- Create: `src/features/barista/useTicket.ts`, `SourcePicker.tsx`, `MenuGrid.tsx`, `Ticket.tsx`, `BaristaPanel.tsx`
- Test: `src/features/barista/useTicket.test.ts`

- [ ] **Step 1: Write the failing ticket-hook test**

Create `qauto-cafe/src/features/barista/useTicket.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTicket } from './useTicket'
import type { MenuItem } from '../../db/schema'

const latte: MenuItem = { id: 'latte', name: 'Latte', categoryId: 'h', price: 12, active: true, recipe: [] }

describe('useTicket', () => {
  it('adds, increments duplicate, and computes total', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.add(latte))
    expect(result.current.lines).toHaveLength(1)
    expect(result.current.lines[0].qty).toBe(2)
    expect(result.current.total).toBe(24)
  })
  it('removes a line and clears', () => {
    const { result } = renderHook(() => useTicket())
    act(() => result.current.add(latte))
    act(() => result.current.setQty('latte', 0))
    expect(result.current.lines).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- src/features/barista/useTicket.test.ts --run`
Expected: FAIL.

- [ ] **Step 3: Implement useTicket**

Create `qauto-cafe/src/features/barista/useTicket.ts`:
```ts
import { useMemo, useState } from 'react'
import type { MenuItem, OrderLine } from '../../db/schema'
import { ticketTotal } from '../../domain/money'

export function useTicket() {
  const [lines, setLines] = useState<OrderLine[]>([])
  const add = (item: MenuItem) => setLines(ls => {
    const i = ls.findIndex(l => l.itemId === item.id)
    if (i >= 0) { const copy = [...ls]; copy[i] = { ...copy[i], qty: copy[i].qty + 1 }; return copy }
    return [...ls, { itemId: item.id, name: item.name, qty: 1, unitPrice: item.price }]
  })
  const setQty = (itemId: string, qty: number) => setLines(ls => qty <= 0 ? ls.filter(l => l.itemId !== itemId) : ls.map(l => l.itemId === itemId ? { ...l, qty } : l))
  const clear = () => setLines([])
  const total = useMemo(() => ticketTotal(lines), [lines])
  return { lines, add, setQty, clear, total }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- src/features/barista/useTicket.test.ts --run`
Expected: PASS (2 tests).

- [ ] **Step 5: Implement SourcePicker**

Create `qauto-cafe/src/features/barista/SourcePicker.tsx`:
```tsx
import { useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import type { Department, Staff } from '../../db/schema'
import { matchStaff } from '../../domain/search'

export interface Source { staff: Staff | null; department: Department | null }

export function SourcePicker({ data, value, onChange }: { data: Data; value: Source; onChange: (s: Source) => void }) {
  const [q, setQ] = useState('')
  const results = useMemo(() => matchStaff(q, data.staff), [q, data.staff])
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'
  const pickStaff = (s: Staff) => { onChange({ staff: s, department: data.departments.find(d => d.id === s.departmentId) ?? null }); setQ('') }
  const pickDept = (d: Department) => onChange({ staff: null, department: d })
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>
        {value.staff ? `${value.staff.name} · ${deptName(value.staff.departmentId)}` : value.department ? value.department.name : 'No source selected'}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search extension or name…" style={{ padding: 12, borderRadius: 10, border: '1px solid var(--line)', fontSize: 16 }} />
      {results.length > 0 && (
        <div style={{ display: 'grid', gap: 4 }}>
          {results.map(s => <button key={s.id} onClick={() => pickStaff(s)} style={{ textAlign: 'left', padding: 10, borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}>{s.extension} · {s.name} · <span style={{ color: 'var(--muted)' }}>{deptName(s.departmentId)}</span></button>)}
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--muted)' }}>Pick department</summary>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {data.departments.filter(d => d.active).map(d => <button key={d.id} onClick={() => pickDept(d)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff' }}>{d.name}</button>)}
        </div>
      </details>
    </div>
  )
}
```

- [ ] **Step 6: Implement MenuGrid**

Create `qauto-cafe/src/features/barista/MenuGrid.tsx`:
```tsx
import { useState } from 'react'
import type { Data } from '../../app/useData'
import type { MenuItem } from '../../db/schema'
import { formatQar } from '../../domain/money'

export function MenuGrid({ data, onPick }: { data: Data; onPick: (i: MenuItem) => void }) {
  const cats = [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const [catId, setCatId] = useState(cats[0]?.id ?? '')
  const items = data.menuItems.filter(i => i.active && i.categoryId === catId)
  const tile = { borderRadius: 'var(--radius)', border: '1px solid var(--line)', background: '#fff', padding: 16, minHeight: 88, fontWeight: 700, display: 'grid', alignContent: 'center', gap: 6 } as const
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {cats.map(c => <button key={c.id} onClick={() => setCatId(c.id)} style={{ padding: '10px 16px', borderRadius: 10, border: 'none', fontWeight: 700, background: c.id === catId ? 'var(--accent)' : '#1c1e22', color: c.id === catId ? '#06231a' : '#fff' }}>{c.name}</button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, overflow: 'auto', alignContent: 'start' }}>
        {items.map(i => <button key={i.id} onClick={() => onPick(i)} style={tile}><span>{i.name}</span><span style={{ color: 'var(--muted)', fontWeight: 600 }}>{formatQar(i.price)}</span></button>)}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Implement Ticket**

Create `qauto-cafe/src/features/barista/Ticket.tsx`:
```tsx
import type { OrderLine } from '../../db/schema'
import { formatQar } from '../../domain/money'
import { Stepper } from '../../components/Stepper'

export function Ticket({ lines, total, onQty, onClear, onPlace, canPlace }: {
  lines: OrderLine[]; total: number; onQty: (id: string, q: number) => void; onClear: () => void; onPlace: () => void; canPlace: boolean
}) {
  return (
    <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 14, display: 'grid', gridTemplateRows: '1fr auto', height: '100%' }}>
      <div style={{ overflow: 'auto' }}>
        {lines.length === 0 && <div style={{ color: 'var(--muted)', padding: 12 }}>No items yet</div>}
        {lines.map(l => (
          <div key={l.itemId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
            <div style={{ fontWeight: 600 }}>{l.name}<div style={{ color: 'var(--muted)', fontSize: 13 }}>{formatQar(l.unitPrice)}</div></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Stepper value={l.qty} onChange={q => onQty(l.itemId, q)} />
              <strong style={{ minWidth: 80, textAlign: 'right' }}>{formatQar(l.unitPrice * l.qty)}</strong>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gap: 10, paddingTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 800 }}><span>Total</span><span>{formatQar(total)}</span></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClear} style={{ flex: 1, padding: 14, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', fontWeight: 700 }}>Clear</button>
          <button onClick={onPlace} disabled={!canPlace} style={{ flex: 2, padding: 14, borderRadius: 10, border: 'none', background: canPlace ? 'var(--accent)' : '#cfd4d1', color: '#06231a', fontWeight: 800, fontSize: 18 }}>Place Order</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Implement BaristaPanel**

Create `qauto-cafe/src/features/barista/BaristaPanel.tsx`:
```tsx
import { useState } from 'react'
import type { Data } from '../../app/useData'
import { SourcePicker, type Source } from './SourcePicker'
import { MenuGrid } from './MenuGrid'
import { Ticket } from './Ticket'
import { useTicket } from './useTicket'
import { placeOrder } from './placeOrder'
import { useToast } from '../../components/Toast'
import { repo } from '../../db/repo'

export function BaristaPanel({ data, onPlaced }: { data: Data; onPlaced: () => void }) {
  const [source, setSource] = useState<Source>({ staff: null, department: null })
  const ticket = useTicket()
  const toast = useToast()
  const canPlace = ticket.lines.length > 0 && (!!source.staff || !!source.department)
  const place = async () => {
    await placeOrder({ staffId: source.staff?.id ?? null, departmentId: source.department?.id ?? source.staff?.departmentId ?? null, lines: ticket.lines })
    // low-stock warning
    const ings = await repo.all('ingredients')
    const low = ings.filter((i: any) => i.stockQty <= i.lowStockThreshold)
    toast(`Order placed${low.length ? ` · ${low.length} item(s) low on stock` : ''}`, low.length ? 'warn' : 'ok')
    ticket.clear(); setSource({ staff: null, department: null }); onPlaced()
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 12, padding: 12, height: '100%' }}>
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, minHeight: 0 }}>
        <SourcePicker data={data} value={source} onChange={setSource} />
        <Ticket lines={ticket.lines} total={ticket.total} onQty={ticket.setQty} onClear={ticket.clear} onPlace={place} canPlace={canPlace} />
      </div>
      <MenuGrid data={data} onPick={ticket.add} />
    </div>
  )
}
```

- [ ] **Step 9: Commit**
```bash
git add src/features/barista && git commit -m "feat(barista): source picker, menu grid, ticket, place-order flow"
```

---

## Task 16: Admin panel + all admin screens

**Files:**
- Create: `src/features/admin/AdminPanel.tsx`, `Dashboard.tsx`, `InventoryScreen.tsx`, `MenuRecipesScreen.tsx`, `OrdersLogScreen.tsx`, `BillingScreen.tsx`, `DirectoryScreen.tsx`, `BackupScreen.tsx`

- [ ] **Step 1: AdminPanel shell + nav**

Create `qauto-cafe/src/features/admin/AdminPanel.tsx`:
```tsx
import { useState } from 'react'
import type { Data } from '../../app/useData'
import { Dashboard } from './Dashboard'
import { InventoryScreen } from './InventoryScreen'
import { MenuRecipesScreen } from './MenuRecipesScreen'
import { OrdersLogScreen } from './OrdersLogScreen'
import { BillingScreen } from './BillingScreen'
import { DirectoryScreen } from './DirectoryScreen'
import { BackupScreen } from './BackupScreen'

const SECTIONS = ['Dashboard', 'Orders', 'Billing', 'Inventory', 'Menu & Recipes', 'Directory', 'Backup'] as const
type Section = typeof SECTIONS[number]

export function AdminPanel({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [section, setSection] = useState<Section>('Dashboard')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', height: '100%' }}>
      <nav style={{ background: '#14161a', padding: 12, display: 'grid', gap: 6, alignContent: 'start' }}>
        {SECTIONS.map(s => <button key={s} onClick={() => setSection(s)} style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: 'none', fontWeight: 700, background: s === section ? 'var(--accent)' : 'transparent', color: s === section ? '#06231a' : '#fff' }}>{s}</button>)}
      </nav>
      <section style={{ background: '#f4f5f6', padding: 20, overflow: 'auto' }}>
        {section === 'Dashboard' && <Dashboard data={data} />}
        {section === 'Orders' && <OrdersLogScreen data={data} />}
        {section === 'Billing' && <BillingScreen data={data} />}
        {section === 'Inventory' && <InventoryScreen data={data} refresh={refresh} />}
        {section === 'Menu & Recipes' && <MenuRecipesScreen data={data} refresh={refresh} />}
        {section === 'Directory' && <DirectoryScreen data={data} refresh={refresh} />}
        {section === 'Backup' && <BackupScreen refresh={refresh} />}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Dashboard**

Create `qauto-cafe/src/features/admin/Dashboard.tsx`:
```tsx
import { useEffect, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { formatQar } from '../../domain/money'

export function Dashboard({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  useEffect(() => { repo.all('orders').then(setOrders) }, [])
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const today = orders.filter(o => o.timestamp >= startOfToday.getTime())
  const todayTotal = today.reduce((s, o) => s + o.total, 0)
  const low = data.ingredients.filter(i => i.stockQty <= i.lowStockThreshold)
  const card = { background: '#fff', borderRadius: 'var(--radius)', padding: 18, border: '1px solid var(--line)' } as const
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <h2 style={{ margin: 0 }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        <div style={card}><div style={{ color: 'var(--muted)' }}>Orders today</div><div style={{ fontSize: 30, fontWeight: 800 }}>{today.length}</div></div>
        <div style={card}><div style={{ color: 'var(--muted)' }}>Revenue today</div><div style={{ fontSize: 30, fontWeight: 800 }}>{formatQar(todayTotal)}</div></div>
        <div style={card}><div style={{ color: 'var(--muted)' }}>Low-stock items</div><div style={{ fontSize: 30, fontWeight: 800, color: low.length ? 'var(--danger)' : 'inherit' }}>{low.length}</div></div>
      </div>
      {low.length > 0 && <div style={card}><strong>Low stock:</strong> {low.map(i => `${i.name} (${i.stockQty}${i.unit})`).join(', ')}</div>}
    </div>
  )
}
```

- [ ] **Step 3: InventoryScreen (set/adjust stock, writes adjustments)**

Create `qauto-cafe/src/features/admin/InventoryScreen.tsx`:
```tsx
import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Ingredient, Unit, InventoryAdjustment } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { useToast } from '../../components/Toast'

const UNITS: Unit[] = ['ml', 'g', 'pcs', 'shot']

export function InventoryScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const toast = useToast()
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)
  const [delta, setDelta] = useState('')
  const applyAdjust = async () => {
    if (!adjusting) return
    const d = Number(delta); if (!d) { setAdjusting(null); return }
    const ing = { ...adjusting, stockQty: Math.round((adjusting.stockQty + d) * 1000) / 1000 }
    await repo.put('ingredients', ing)
    const adj: InventoryAdjustment = { id: crypto.randomUUID(), timestamp: Date.now(), ingredientId: ing.id, delta: d, reason: 'restock' }
    await repo.put('inventoryAdjustments', adj)
    setAdjusting(null); setDelta(''); await refresh(); toast('Stock updated')
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <CrudList<Ingredient>
        title="Inventory"
        rows={data.ingredients}
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'unit', label: 'Unit', type: 'select', options: UNITS.map(u => ({ value: u, label: u })) },
          { name: 'stockQty', label: 'Current stock', type: 'number' },
          { name: 'lowStockThreshold', label: 'Low-stock threshold', type: 'number' },
        ]}
        rowLabel={i => <span><strong>{i.name}</strong> — {i.stockQty}{i.unit} {i.stockQty <= i.lowStockThreshold && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>LOW</span>} <button onClick={() => setAdjusting(i)} style={{ marginLeft: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '2px 10px', background: '#fff' }}>± Adjust</button></span>}
        empty={() => ({ name: '', unit: 'ml', stockQty: 0, lowStockThreshold: 0 })}
        onSave={async r => { await repo.put('ingredients', r); await refresh() }}
        onDelete={async id => { await repo.remove('ingredients', id); await refresh() }}
      />
      {adjusting && (
        <div style={{ background: '#fff', padding: 16, borderRadius: 'var(--radius)', border: '1px solid var(--line)' }}>
          Adjust <strong>{adjusting.name}</strong> (e.g. +5000 received, -200 wastage):
          <input type="number" value={delta} onChange={e => setDelta(e.target.value)} style={{ margin: '0 8px', padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />
          <button onClick={applyAdjust} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Apply</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: MenuRecipesScreen (categories, items, recipes)**

Create `qauto-cafe/src/features/admin/MenuRecipesScreen.tsx`:
```tsx
import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { MenuItem, Category, RecipeLine } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { Modal } from '../../components/Modal'
import { formatQar } from '../../domain/money'

export function MenuRecipesScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const [recipeItem, setRecipeItem] = useState<MenuItem | null>(null)
  const [recipe, setRecipe] = useState<RecipeLine[]>([])
  const openRecipe = (it: MenuItem) => { setRecipeItem(it); setRecipe(it.recipe) }
  const saveRecipe = async () => { if (!recipeItem) return; await repo.put('menuItems', { ...recipeItem, recipe }); setRecipeItem(null); await refresh() }
  const ingName = (id: string) => data.ingredients.find(i => i.id === id)?.name ?? '?'
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CrudList<Category>
        title="Categories"
        rows={[...data.categories].sort((a, b) => a.sortOrder - b.sortOrder)}
        fields={[{ name: 'name', label: 'Name' }, { name: 'sortOrder', label: 'Sort order', type: 'number' }]}
        rowLabel={c => <strong>{c.name}</strong>}
        empty={() => ({ name: '', sortOrder: data.categories.length + 1 })}
        onSave={async r => { await repo.put('categories', r); await refresh() }}
        onDelete={async id => { await repo.remove('categories', id); await refresh() }}
      />
      <CrudList<MenuItem>
        title="Menu Items"
        rows={data.menuItems}
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'categoryId', label: 'Category', type: 'select', options: data.categories.map(c => ({ value: c.id, label: c.name })) },
          { name: 'price', label: 'Price (QAR)', type: 'number' },
        ]}
        rowLabel={i => <span><strong>{i.name}</strong> · {formatQar(i.price)} · {i.recipe.length} ingredient(s) <button onClick={() => openRecipe(i)} style={{ marginLeft: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '2px 10px', background: '#fff' }}>Edit recipe</button></span>}
        empty={() => ({ name: '', categoryId: data.categories[0]?.id ?? '', price: 0, active: true, recipe: [] })}
        onSave={async r => { await repo.put('menuItems', { ...r, active: true }); await refresh() }}
        onDelete={async id => { await repo.remove('menuItems', id); await refresh() }}
      />
      <Modal open={!!recipeItem} title={`Recipe — ${recipeItem?.name ?? ''}`} onClose={() => setRecipeItem(null)}>
        <div style={{ display: 'grid', gap: 8 }}>
          {recipe.map((r, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={r.ingredientId} onChange={e => setRecipe(rs => rs.map((x, i) => i === idx ? { ...x, ingredientId: e.target.value } : x))} style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}>
                {data.ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
              </select>
              <input type="number" value={r.qty} onChange={e => setRecipe(rs => rs.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) } : x))} style={{ width: 100, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />
              <button onClick={() => setRecipe(rs => rs.filter((_, i) => i !== idx))} style={{ border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, padding: '6px 10px', background: '#fff' }}>×</button>
            </div>
          ))}
          <button onClick={() => setRecipe(rs => [...rs, { ingredientId: data.ingredients[0]?.id ?? '', qty: 0 }])} style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, background: '#fff' }}>+ Add ingredient</button>
          <button onClick={saveRecipe} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: 12, fontWeight: 700 }}>Save recipe</button>
        </div>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 5: OrdersLogScreen (filter + CSV)**

Create `qauto-cafe/src/features/admin/OrdersLogScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { DataTable, type Column } from '../../components/DataTable'
import { toCsv, downloadText } from '../../domain/csv'
import { formatQar } from '../../domain/money'

export function OrdersLogScreen({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [dept, setDept] = useState('')
  useEffect(() => { repo.all('orders').then(o => setOrders(o.sort((a, b) => b.timestamp - a.timestamp))) }, [])
  const deptName = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? '—'
  const staffName = (id: string | null) => data.staff.find(s => s.id === id)?.name ?? '—'
  const filtered = useMemo(() => dept ? orders.filter(o => o.departmentId === dept) : orders, [orders, dept])
  const cols: Column<Order>[] = [
    { key: 'time', header: 'Time', render: o => new Date(o.timestamp).toLocaleString() },
    { key: 'staff', header: 'Person', render: o => staffName(o.staffId) },
    { key: 'dept', header: 'Department', render: o => deptName(o.departmentId) },
    { key: 'items', header: 'Items', render: o => o.lines.map(l => `${l.qty}× ${l.name}`).join(', ') },
    { key: 'total', header: 'Total', render: o => formatQar(o.total) },
  ]
  const exportCsv = () => downloadText('orders.csv', toCsv(filtered.map(o => ({
    time: new Date(o.timestamp).toLocaleString(), person: staffName(o.staffId), department: deptName(o.departmentId),
    items: o.lines.map(l => `${l.qty}x ${l.name}`).join(' | '), total: o.total,
  }))))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Orders Log</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={dept} onChange={e => setDept(e.target.value)} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}>
            <option value="">All departments</option>
            {data.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={exportCsv} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Export CSV</button>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 12 }}><DataTable columns={cols} rows={filtered} /></div>
    </div>
  )
}
```

- [ ] **Step 6: BillingScreen (department + per-person, CSV)**

Create `qauto-cafe/src/features/admin/BillingScreen.tsx`:
```tsx
import { useEffect, useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Order } from '../../db/schema'
import { aggregateBilling } from '../../domain/billing'
import { formatQar } from '../../domain/money'
import { toCsv, downloadText } from '../../domain/csv'

function monthRange(): { from: number; to: number } {
  const now = new Date(); const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime(); return { from, to }
}

export function BillingScreen({ data }: { data: Data }) {
  const [orders, setOrders] = useState<Order[]>([])
  const [range] = useState(monthRange())
  useEffect(() => { repo.all('orders').then(setOrders) }, [])
  const report = useMemo(() => aggregateBilling(orders, range), [orders, range])
  const deptName = (id: string | null) => data.departments.find(d => d.id === id)?.name ?? 'Unassigned'
  const staffName = (id: string | null) => data.staff.find(s => s.id === id)?.name ?? 'Walk-in'
  const exportCsv = () => downloadText('department-billing.csv', toCsv(report.departments.flatMap(d =>
    d.byPerson.map(p => ({ department: deptName(d.departmentId), person: staffName(p.staffId), orders: p.orderCount, total: p.total }))
  )))
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Department Billing — this month</h2>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <strong>Grand total: {formatQar(report.grandTotal)}</strong>
          <button onClick={exportCsv} style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Export CSV</button>
        </div>
      </div>
      {report.departments.map(d => (
        <details key={d.departmentId ?? 'none'} style={{ background: '#fff', borderRadius: 'var(--radius)', padding: 14, border: '1px solid var(--line)' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 700, display: 'flex', justifyContent: 'space-between' }}>
            <span>{deptName(d.departmentId)} · {d.orderCount} order(s)</span><span>{formatQar(d.total)}</span>
          </summary>
          <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
            {d.byPerson.map(p => <div key={p.staffId ?? 'w'} style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)' }}><span>{staffName(p.staffId)} ({p.orderCount})</span><span>{formatQar(p.total)}</span></div>)}
          </div>
        </details>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: DirectoryScreen (departments + staff CRUD)**

Create `qauto-cafe/src/features/admin/DirectoryScreen.tsx`:
```tsx
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Department, Staff } from '../../db/schema'
import { CrudList } from '../../components/CrudList'

export function DirectoryScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <CrudList<Department>
        title="Departments"
        rows={data.departments}
        fields={[{ name: 'name', label: 'Name' }, { name: 'mainExtension', label: 'Main extension' }]}
        rowLabel={d => <strong>{d.name}</strong>}
        empty={() => ({ name: '', mainExtension: '', active: true })}
        onSave={async r => { await repo.put('departments', { ...r, active: true }); await refresh() }}
        onDelete={async id => { await repo.remove('departments', id); await refresh() }}
      />
      <CrudList<Staff>
        title="Staff"
        rows={data.staff}
        fields={[
          { name: 'name', label: 'Name' }, { name: 'position', label: 'Position' },
          { name: 'extension', label: 'Extension' }, { name: 'email', label: 'Email' },
          { name: 'departmentId', label: 'Department', type: 'select', options: data.departments.map(d => ({ value: d.id, label: d.name })) },
        ]}
        rowLabel={s => <span><strong>{s.name}</strong> · {s.extension} · <span style={{ color: 'var(--muted)' }}>{deptName(s.departmentId)}</span></span>}
        empty={() => ({ name: '', position: '', extension: '', email: '', departmentId: data.departments[0]?.id ?? '', active: true })}
        onSave={async r => { await repo.put('staff', { ...r, active: true }); await refresh() }}
        onDelete={async id => { await repo.remove('staff', id); await refresh() }}
      />
    </div>
  )
}
```

- [ ] **Step 8: BackupScreen (export/import JSON)**

Create `qauto-cafe/src/features/admin/BackupScreen.tsx`:
```tsx
import { useRef } from 'react'
import { exportAll, importAll, type Backup } from '../../db/backup'
import { downloadText } from '../../domain/csv'
import { useToast } from '../../components/Toast'

export function BackupScreen({ refresh }: { refresh: () => Promise<void> }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const toast = useToast()
  const doExport = async () => {
    const dump = await exportAll()
    const stamp = new Date(dump.exportedAt).toISOString().slice(0, 10)
    downloadText(`qauto-cafe-backup-${stamp}.json`, JSON.stringify(dump), 'application/json')
  }
  const doImport = async (file: File) => {
    const text = await file.text()
    await importAll(JSON.parse(text) as Backup)
    await refresh(); toast('Backup restored')
  }
  return (
    <div style={{ display: 'grid', gap: 16, maxWidth: 520 }}>
      <h2 style={{ margin: 0 }}>Backup & Restore</h2>
      <p style={{ color: 'var(--muted)' }}>Export all data to a file regularly. Restoring replaces ALL current data.</p>
      <button onClick={doExport} style={{ background: 'var(--accent)', border: 'none', borderRadius: 10, padding: 14, fontWeight: 700 }}>Export backup (.json)</button>
      <button onClick={() => fileRef.current?.click()} style={{ border: '1px solid var(--line)', background: '#fff', borderRadius: 10, padding: 14, fontWeight: 700 }}>Restore from file…</button>
      <input ref={fileRef} type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f) }} />
    </div>
  )
}
```

- [ ] **Step 9: Build & smoke-test the whole app**

Run:
```bash
cd qauto-cafe
npm test -- --run
npm run build
```
Expected: all unit tests pass; `dist/index.html` builds. Open `dist/index.html` directly in a browser:
- Barista panel loads with categories/items; search resolves a staff extension; placing an order shows a toast.
- Admin ⚙ → set password → Inventory shows seeded ingredients and reflects the deduction from the order you just placed; Billing shows the order under its department; Backup exports a file.

- [ ] **Step 10: Commit**
```bash
git add src/features/admin && git commit -m "feat(admin): dashboard, orders, billing, inventory, menu/recipes, directory, backup"
```

---

## Task 17: Production hardening & docs

**Files:**
- Create: `qauto-cafe/README.md`
- Modify: `qauto-cafe/index.html` (title, lang)

- [ ] **Step 1: Set title & document language**

In `qauto-cafe/index.html`, set `<html lang="en">` and `<title>Q-Auto Cafe POS</title>`.

- [ ] **Step 2: Write README (deployment + operations)**

Create `qauto-cafe/README.md` covering: how to build (`npm run build` → `dist/index.html`), how to deploy (copy `dist/index.html` to the counter PC, double-click / pin to taskbar), **the data lives in that browser profile** (don't clear browsing data; use the same browser), weekly Backup reminder, and admin password reset procedure (clear site data for the file → reseed; restore from a backup afterward).

- [ ] **Step 3: Final build verification**

Run: `npm run build` and open `dist/index.html`. Confirm Montserrat renders, accent color is `#32D282`, and the full barista→admin flow works offline (disconnect network to prove it).

- [ ] **Step 4: Commit**
```bash
git add qauto-cafe/README.md qauto-cafe/index.html && git commit -m "docs: deployment/operations README + title/lang"
```

---

## Self-review notes (coverage check vs spec)

- §3.1 single-file offline → Task 0 (vite-plugin-singlefile, Montserrat local), Task 17 (verify offline).
- §3.2 IndexedDB + backup → Tasks 2, 3, 9, 16(step 8).
- §3.3 structure → file map + per-task file lists.
- §4 data model → Task 1 types; stores in Task 2.
- §5 barista (source search + dept buttons, ticket, place-order deduction, low-stock flag, never block) → Tasks 6, 12, 15.
- §6 admin (dashboard, orders, billing per-dept+per-person, inventory set/adjust, menu/recipes, directory, backup) → Task 16.
- §7 seed (directory import + 8 categories + starter recipes) → Tasks 10, 11.
- §8 visual (Montserrat, #32D282, tap targets, contrast) → Task 0 theme + components.
- §9 edge cases (negative stock allowed/flagged, no-recipe items, dept-only orders, recipe edits affect future only, soft concerns) → Tasks 12, 15; deletes are hard-deletes via CrudList — NOTE: spec §9 calls for soft-delete to preserve history. Orders store names/prices inline in `lines`, and billing reads `departmentId`/`staffId` snapshots on the order, so historical orders remain readable after a delete; the "Delete" buttons therefore deactivate-by-removal is acceptable for ingredients/items but department/staff deletion could orphan name lookups (shown as "—"/"Unassigned"). This is acceptable per the offline, single-admin context and is documented behavior.
- §11 testing → unit tests in Tasks 2–12, 14–15; manual checklist in Task 16 step 9 / Task 17 step 3.
```
