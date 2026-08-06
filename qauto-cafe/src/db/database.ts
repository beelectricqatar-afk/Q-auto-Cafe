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
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'key' })
        if (!db.objectStoreNames.contains('deletionLogs')) db.createObjectStore('deletionLogs', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('requests')) db.createObjectStore('requests', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('financeExpenses')) {
          const f = db.createObjectStore('financeExpenses', { keyPath: 'id' })
          f.createIndex('timestamp', 'timestamp'); f.createIndex('category', 'category')
        }
        if (!db.objectStoreNames.contains('financeReceipts')) {
          const r = db.createObjectStore('financeReceipts', { keyPath: 'id' })
          r.createIndex('uploadedAt', 'uploadedAt')
        }
        if (!db.objectStoreNames.contains('financeWastages')) {
          const w = db.createObjectStore('financeWastages', { keyPath: 'id' })
          w.createIndex('timestamp', 'timestamp')
        }
      },
    })
  }
  return dbPromise
}

export function resetDbCache() { dbPromise = null } // test helper
