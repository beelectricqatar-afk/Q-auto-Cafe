// One-time seed: push the built-in seed data into Supabase.
// Idempotent (upsert by id). Credentials come from env — never hard-coded:
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_KEY=<publishable key> \
//     node scripts/seed-supabase.mjs
//
// Each domain store is mirrored as { id, data: <full record>, updated_at }.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_KEY
if (!URL || !KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_KEY env vars.')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const seed = JSON.parse(readFileSync(join(here, '..', 'src', 'db', 'seed.data.json'), 'utf8'))

// store key in seed.data.json -> Supabase table name
const MAP = {
  departments: 'departments',
  staff: 'staff',
  ingredients: 'ingredients',
  categories: 'categories',
  menuItems: 'menu_items',
}

const now = Date.now()

async function upsert(table, rows) {
  const body = JSON.stringify(rows.map(r => ({ id: r.id, data: r, updated_at: now })))
  const res = await fetch(`${URL}/rest/v1/${table}?on_conflict=id`, {
    method: 'POST',
    headers: {
      'apikey': KEY,
      'Authorization': `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${table}: HTTP ${res.status} ${text}`)
  }
}

async function count(table) {
  const res = await fetch(`${URL}/rest/v1/${table}?select=id`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Prefer': 'count=exact', 'Range': '0-0' },
  })
  return res.headers.get('content-range')?.split('/')?.[1] ?? '?'
}

for (const [seedKey, table] of Object.entries(MAP)) {
  const rows = seed[seedKey] ?? []
  await upsert(table, rows)
  console.log(`seeded ${table}: pushed ${rows.length}, table now has ${await count(table)}`)
}
console.log('Done.')
