import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Card } from './Card'
import { TrashIcon } from '../features/admin/sidebarIcons'

export interface Field { name: string; label: string; type?: 'text' | 'number' | 'select'; options?: { value: string; label: string }[] }

export function CrudList<T extends { id: string }>(props: {
  title: string
  rows: T[]
  fields: Field[]
  rowLabel: (r: T) => ReactNode
  empty: () => Omit<T, 'id'>
  onSave: (row: T) => Promise<void>
  onDelete: (id: string) => Promise<void>
  /** Supplying this adds a search box above the list, matched against the text it returns. */
  searchText?: (r: T) => string
  searchPlaceholder?: string
}) {
  const { title, rows, fields, rowLabel, empty, onSave, onDelete, searchText, searchPlaceholder } = props
  const [editing, setEditing] = useState<any | null>(null)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = searchText && q ? rows.filter(r => searchText(r).toLowerCase().includes(q)) : rows
  const open = (r?: T) => setEditing(r ? { ...r } : { id: '', ...empty() })
  const save = async () => {
    const row = { ...editing, id: editing.id || crypto.randomUUID() }
    for (const f of fields) if (f.type === 'number') row[f.name] = Number(row[f.name] ?? 0)
    await onSave(row); setEditing(null)
  }
  return (
    <div>
      {searchText && (
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
          style={{ width: '100%', boxSizing: 'border-box', padding: 10, marginBottom: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 15, fontFamily: 'inherit' }}
        />
      )}
      <Card
        title={q ? `${title} (${shown.length} of ${rows.length})` : title}
        padding={0}
        actions={<button onClick={() => open()} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 16px', fontWeight: 700 }}>+ Add</button>}
      >
        {shown.length === 0 && <div className="card-row" style={{ color: 'var(--muted)' }}>{q ? `No matches for "${query.trim()}".` : 'Nothing here yet.'}</div>}
        {shown.map(r => (
          <div key={r.id} className="card-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <div>{rowLabel(r)}</div>
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button onClick={() => open(r)} style={{ border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600 }}>Edit</button>
              <button onClick={() => onDelete(r.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          </div>
        ))}
      </Card>
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
            <button onClick={save} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 10, padding: '12px', fontWeight: 700 }}>Save</button>
          </div>
        )}
      </Modal>
    </div>
  )
}
