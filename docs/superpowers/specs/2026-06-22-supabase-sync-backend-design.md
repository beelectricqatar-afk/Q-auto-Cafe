# Q-Auto Cafe POS — Supabase Sync Backend & Vercel Deploy

**Date:** 2026-06-22
**Status:** Approved design
**Topic:** Add a shared Supabase backend with cross-device sync to the existing local-first POS, and deploy to Vercel.

## Goal

Today the POS runs entirely on-device using IndexedDB (single device, offline,
no server). We want the data (orders, staff directory, menu, recipes,
inventory) to be **shared across multiple devices** via Supabase, while keeping
the app fast and resilient to wifi drops. The app's own **admin panel remains
the place to read and manage all data** — nobody needs to open the Supabase
dashboard.

## Decisions (from brainstorming)

- **Backend role:** Full shared backend across devices.
- **Architecture:** Local-first. Keep IndexedDB as each device's working store;
  add a thin Supabase sync layer on top. (Least disruptive to the existing
  codebase and keeps offline working.)
- **Access / auth:** None. No app password, no admin password. The existing
  admin PIN gate is removed. Supabase uses its public anon key with permissive
  access rules.
  - *Accepted tradeoff:* the public Vercel URL means anyone with the link can
    read, change, or wipe data. The owner accepted this for simplicity. A
    light gate or unguessable URL can be added later if needed.
- **Sync style:** On open / refresh (and on reconnect). No realtime
  subscriptions.
- **Offline:** The app keeps working offline. Local changes queue and push
  automatically when the connection returns; other devices pick them up on
  their next refresh.
- **Backups:** Automatic snapshot every 12 hours, stored in Supabase. Light.
- **Starting data:** Seed Supabase fresh from the built-in seed (150+ staff,
  departments, menu, recipes, ingredients). Order history starts empty.
- **Build:** Switch off the single-file build; use a normal Vite build for
  Vercel.

## Architecture

```
┌─────────────── Device (browser) ───────────────┐
│  Feature screens (Barista, Admin)               │
│        │ reads/writes (unchanged)               │
│        ▼                                         │
│  repo.ts  ──►  IndexedDB (local working store)   │
│        │                                         │
│        ▼ (mark pending / updatedAt)              │
│  sync module  ◄────────────────────────────────┐│
└────────│─────────────────────────────────────┘│
         │ push pending / pull changed            │
         ▼                                         │
   Supabase Postgres  (shared mirror)  ◄───────────┘
         + backups table (12h snapshots)
```

- **IndexedDB stays the source for reads** — instant and offline-safe.
- **Supabase Postgres is the shared mirror** between devices.
- **Reads** never block on the network. **Writes** go to IndexedDB immediately,
  then sync.

## Components

### 1. Sync engine (`src/sync/`)

New module, isolated behind a small interface. Responsibilities:

- **Tracking:** every record carries `updatedAt`, stored as a **bigint
  milliseconds-since-epoch** number (consistent with the existing numeric
  `Order.timestamp`). Mutations mark the record pending locally (a `_pending`
  flag in IndexedDB, or a per-store pending set in `meta`).
- **Push:** upsert all pending rows to the matching Supabase table; clear
  pending on success.
- **Pull:** for each table, fetch rows with `updatedAt` greater than the stored
  `lastPulledAt[table]` (in `meta`); upsert them into IndexedDB; advance
  `lastPulledAt`.
- **Conflict resolution:** last-write-wins by `updatedAt`. Safe because orders
  and inventory adjustments are append-only (new rows, never edited), and the
  only mutable records (menu, staff, ingredients/stock) are admin-managed where
  newest-wins is the desired behavior.
- **Triggers (matches the "on open / refresh" decision — no background
  polling):** on app load, on screen switch / manual refresh, and on the
  `window` `online` event (reconnect). The reconnect trigger is what flushes
  queued offline writes; no periodic timer.
- **Connection state:** `navigator.onLine` + `online`/`offline` events; the
  engine no-ops while offline and flushes on reconnect.

### 2. Supabase client (`src/db/supabase.ts`)

- Single configured client using `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY` from env.
- No session/auth; anon key only.

### 3. Schema / migration (SQL)

- One table per existing store: `departments, staff, ingredients, categories,
  menu_items, orders, inventory_adjustments, meta`.
- **Generic jsonb-blob shape** (lightest, and fine since the tables are never
  read directly — the admin panel is the UI): every table is
  `id text primary key, data jsonb not null, updated_at bigint`. `data` holds
  the full record exactly as it lives in IndexedDB, so the sync layer needs no
  field mapping. For `meta`, `id` holds the meta key. An index on `updated_at`
  per table supports incremental pulls.
- A `backups` table: `id`, `created_at` (bigint ms), `payload` (jsonb snapshot).
- Permissive row-level security: a single `for all` policy granting anon (and
  authenticated) full access on every table (matches the no-auth decision).
- Delivered as `qauto-cafe/supabase/schema.sql`, run once via the Supabase SQL
  editor (or the Supabase MCP). Idempotent.

### 4. Seed (`scripts/seed-supabase.*`)

- One-time script that loads `src/db/seed.data.json` into Supabase
  (departments, staff, ingredients, categories, menu items, recipes). Orders and
  inventory adjustments start empty.
- Idempotent (upsert by `id`) so re-running is safe.

### 5. Auto-backup

- On app load, read `lastBackupAt` from `meta`. If `now - lastBackupAt >= 12h`,
  build a JSON snapshot of all tables and insert one row into the `backups`
  table; update `lastBackupAt`.
- Prune `backups` to the most recent ~28 rows (~2 weeks at 12h).
- Light: no scheduler, no worker — just a check at load time on whichever device
  is open.

### 6. Remove admin gate

- Delete the PIN gate (`AdminGate`); the admin panel renders directly.

### 7. Build & deploy

- Remove `vite-plugin-singlefile` / single-file build settings from
  `vite.config.ts`; restore a standard Vite build (hashed assets in `dist/`).
- Vercel project: root directory `qauto-cafe`, framework preset Vite, build
  `npm run build`, output `dist`. Env vars: `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.

## Data flow examples

- **Barista places an order (online):** order written to IndexedDB → marked
  pending → next sync tick upserts it to Supabase → other devices pull it on
  their next refresh.
- **Barista places an order (offline):** order written to IndexedDB and shown
  normally → stays pending → on reconnect, sync pushes it up → admin sees it
  after its next refresh.
- **Admin edits a menu price:** updated row in IndexedDB with new `updatedAt` →
  pushed → other devices pull the newer version (newest wins).

## Error handling

- **Network errors during push/pull:** caught; rows stay pending; retried on the
  next trigger. No data loss.
- **Partial sync:** per-table `lastPulledAt` advances only after a successful
  pull for that table, so an interrupted sync resumes correctly.
- **Backup failure:** logged, `lastBackupAt` not advanced, retried next load.
  Never blocks the UI.
- **Bad/missing env vars:** app still runs in pure-local mode and surfaces a
  clear "not connected to cloud" indicator rather than crashing.

## Testing

- **Sync engine (unit):** push collects pending rows; pull applies only newer
  rows; last-write-wins picks the higher `updatedAt`; `lastPulledAt` advances
  correctly; offline → no-op then flush on reconnect. Use `fake-indexeddb` (already
  a dev dep) and a mocked Supabase client.
- **Backup:** triggers only when ≥12h elapsed; prunes to the cap; failure
  doesn't advance `lastBackupAt`.
- **Seed script:** idempotent upsert (running twice yields the same rows).
- **Existing test suite:** must remain green; IndexedDB-backed feature tests
  are unaffected since reads/writes through `repo.ts` are unchanged.

## Out of scope (YAGNI)

- Realtime subscriptions.
- Per-staff accounts / authentication / RLS by user.
- Field-level conflict merging (row-level last-write-wins is sufficient).
- Local auto-download backups (cloud snapshot only).

## Risks

- **Open access:** public URL with no auth — anyone with the link controls all
  data. Accepted; revisit if it becomes a problem.
- **Last-write-wins on mutable records:** simultaneous admin edits to the same
  record from two devices — the later write wins and the earlier is lost. Low
  likelihood for a single small admin team; acceptable for "light."
