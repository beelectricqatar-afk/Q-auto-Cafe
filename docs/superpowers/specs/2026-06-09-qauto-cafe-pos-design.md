# Q-Auto Cafe POS — Design Specification

**Date:** 2026-06-09
**Owner:** Q-Auto (internal employee cafe)
**Status:** Approved design → ready for implementation planning

---

## 1. Purpose

A simple, professional, accessible point-of-sale system for the Q-Auto internal
cafe that serves company employees. It replaces a heavyweight commercial POS
(Sapaad-based "Q-Cafe") with a focused two-panel app:

- **Barista panel** — take orders, tag each order to the ordering employee and
  their department, and automatically deduct ingredients from inventory.
- **Admin panel** (password-protected) — manage menu/recipes/inventory/directory,
  view the order log, and produce per-department charge-back reports.

Design priorities, in order: **minimum friction at the counter**, **professional
and accessible UI**, **reliable offline operation**, **accurate inventory**.

---

## 2. Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Hosting / storage | **Single counter PC, fully offline, browser-based.** Data in IndexedDB. |
| Payment model | **Charge-back to departments** (prices tracked; no cash handling). |
| Order tagging | **Department + specific person** (resolved from the staff directory). |
| Barista device | **Touchscreen all-in-one PC** (touch-first, large targets, large screen). |
| Source ID flow | **Search box (extension OR name) + department quick-buttons** fallback. |
| Directory seeding | **Import the full Q-Auto Directory** (staff, extensions, departments) now. |
| Menu seeding | **Recreate the 8 old categories** with editable placeholder items + starter recipes. |
| Access control | **Barista panel open by default; admin behind a password.** |
| Tech approach | **React + Vite + TypeScript**, compiled to a **single self-contained `index.html`** via `vite-plugin-singlefile`. |
| Billing granularity | **Per-department totals + expandable per-person breakdown**, CSV export. |

---

## 3. Technical architecture

### 3.1 Stack & deployment
- **React + Vite + TypeScript** for the application.
- **`vite-plugin-singlefile`**: production build inlines all JS, CSS, and the
  Montserrat font into one `index.html`. The barista **double-clicks** this file;
  it runs in any modern browser with **no server, no internet, no install**.
- **`npm run dev`** remains available for development and future edits.
- **Montserrat** font files are bundled locally (no Google Fonts CDN) so the app
  is fully offline.

### 3.2 Persistence
- **IndexedDB** via the `idb` library (thin typed wrapper).
- One database (`qauto_cafe`) with object stores matching the data model (§4).
- **Backup / Restore**: export the entire database to a timestamped `.json` file;
  re-import to restore. This protects against browser-cache clearing on the
  counter PC. (Recommended weekly backup — surfaced as a reminder in admin.)
- All writes are transactional; the order-placement deduction (§5.3) runs in a
  single transaction so an order and its inventory deductions stay consistent.

### 3.3 Code structure (target)
```
src/
  db/            # IndexedDB schema, migrations, typed accessors, backup/restore
  domain/        # pure logic: recipe deduction, billing aggregation, search
  features/
    barista/     # order entry, source search, ticket, place-order
    admin/        # dashboard, orders log, billing, inventory, menu/recipes, directory
  components/    # shared UI (tiles, tables, modals, toasts, number pad)
  styles/        # theme tokens (Q-Auto colors, Montserrat), globals
  app/           # routing/shell, admin password gate
```
Each feature is self-contained; shared domain logic is pure and unit-testable.

---

## 4. Data model (IndexedDB object stores)

- **departments** `{ id, name, mainExtension, active }`
- **staff** `{ id, name, position, email, extension, departmentId, active }`
- **ingredients** `{ id, name, unit, stockQty, lowStockThreshold }`
  - `unit` ∈ { `ml`, `g`, `pcs`, `shot` } (extensible).
- **categories** `{ id, name, sortOrder }`
- **menuItems** `{ id, name, categoryId, price, active, recipe: [{ ingredientId, qty }] }`
- **orders** `{ id, timestamp, staffId, departmentId, lines: [{ itemId, name, qty, unitPrice }], total }`
  - `staffId` may be null for a department-only / walk-in order.
- **inventoryAdjustments** `{ id, timestamp, ingredientId, delta, reason, orderId? }`
  - Audit trail. `reason` ∈ { `order`, `restock`, `manual`, `stocktake` }.
- **meta** `{ key, value }` — admin password hash, schema version, last-backup date.

---

## 5. Barista panel

### 5.1 Source identification
- A **search box** accepts an extension number *or* a name; matches resolve to a
  person (showing **name + department**) as the operator types.
- **Department quick-buttons** (a grid of all active departments) as a fallback or
  for department-only orders.
- Selected source is pinned at the top of the ticket; can be changed before placing.

### 5.2 Order building
- **Category tiles** → **item tiles** (large, touch-friendly, mirrors old layout).
- Left-side **running ticket**: each line shows name, qty with +/– steppers,
  unit price, and line subtotal; footer shows **Total (QAR)**.
- Remove line; clear ticket; optional per-order note.

### 5.3 Place order (core transaction)
On **Place Order**, within a single IndexedDB transaction:
1. Write the `orders` record (source, lines, total, timestamp).
2. For each line × each recipe ingredient: deduct `recipeQty × lineQty` from
   `ingredients.stockQty` and write an `inventoryAdjustments` record
   (`reason: 'order'`, linked `orderId`).
3. Show a success toast. Items whose stock crosses below threshold or goes
   negative are flagged (red), but **the order is never blocked mid-service**.
4. Reset the ticket for the next order.

Example: Latte recipe = 250 ml milk + 18 g beans. Ordering 1 Latte deducts
250 ml milk and 18 g beans; stock 500 ml → 250 ml milk.

---

## 6. Admin panel (password-protected)

Entry via a gear icon → password prompt (hash stored in `meta`). Sections:

- **Dashboard** — today's order count & total, top items, low-stock alerts,
  last-backup reminder.
- **Orders log** — all orders; filter by department / date range / person;
  view line detail; **export CSV**.
- **Department billing** — totals per department over a date range (primary
  charge-back view), each expandable to a **per-person breakdown**; **export CSV**.
- **Inventory** — ingredients with unit, current stock, low-stock threshold.
  Free **set/adjust** of quantities (e.g. "received 5 L milk" → +5000 ml), each
  change written to `inventoryAdjustments` (`reason: 'restock'`/`'manual'`).
- **Menu & Recipes** — manage categories, items, prices, active flag, and each
  item's **recipe** (ingredient + amount). Recipes drive auto-deduction.
- **Directory** — manage departments and staff (name, position, email,
  extension, department). Pre-imported from the Q-Auto Directory spreadsheet.
- **Backup / Restore** — export/import the full database as JSON.

---

## 7. Seed data

### 7.1 Directory import
Parse `Q-Auto Directory 2026.xlsx` into `departments` and `staff`. Departments
derive from the directory's section headers (Finance, HR, Credit & Collection,
Q-Mobility Export, Projects/Facility/BE Electric, Logistics/Insurance, Q-Mobility
Rent, SAWA, Central Marketing, Audi & VW Commercial/Fleet, Sales Admin, CRM, VW
New Car, Skoda, Audi New Car, Used Car, Aftersales, Audi Service, VW Service,
Royal Enfield, Zeal, IT Support, Security, Q-Cafe, etc.). The admin can curate
these down to the canonical 17 (rename/merge/deactivate) post-import.

### 7.2 Menu & recipes
Recreate the 8 categories from the old POS — **Iced Drinks, Hot Drinks, Tea,
Mojitos, Pastries, Protein Bars, Soft Drinks, Fresh Juices** — each with example
items and **starter recipes** (clearly editable placeholders), plus a starter
ingredient list (milk, beans, syrups, cups, etc.). All editable in admin.

---

## 8. Visual design

- **Branding:** Q-Auto. White surfaces on near-black; **mint/teal accent**
  (exact value sampled from the Q-Auto logo, approx `#1ED9A3`). Arabic+English
  logo lockup; tagline "Growing Stronger, Progressing Together."
- **Typography:** Montserrat throughout (bundled locally).
- **Layout:** large rounded touch tiles, generous spacing, high-contrast text,
  visible focus states, big tap targets (≥44px) for the touchscreen.
- **Currency:** QAR.
- **Accessibility:** WCAG-AA contrast, keyboard operable, clear states/toasts.

---

## 9. Edge cases & rules

- **Negative stock:** allowed but flagged red; never blocks an order.
- **Item with no recipe:** sells fine; deducts nothing (logged).
- **Department-only order:** allowed (`staffId` null).
- **Editing a recipe:** affects only *future* orders; past adjustments are immutable.
- **Deleting an item/ingredient:** soft-delete (deactivate) to preserve order history.
- **Data loss protection:** Backup/Restore + last-backup reminder on dashboard.
- **Admin password reset:** if forgotten, recoverable only by clearing app data
  (documented); acceptable given offline single-PC, low-security context.

---

## 10. Out of scope (YAGNI)

- Cash/card payment, receipts, tendering.
- Multi-device sync, cloud hosting, user accounts beyond the single admin password.
- Delivery/dine-in/table management (old system had these; not needed).
- Purchase orders, stock transfers between locations, batch production.

---

## 11. Testing approach

- **Unit tests** (pure domain logic): recipe deduction math, billing aggregation,
  extension/name search, CSV export formatting, backup/restore round-trip.
- **Component tests**: ticket math, place-order flow updates inventory, admin
  inventory adjustment writes an audit record.
- **Manual QA checklist**: full barista order on touch, low-stock flagging,
  department billing export, backup→clear→restore.
