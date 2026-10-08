import { useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Card } from './Card'
import { Button } from './ui/button'
import { Input, Select } from './ui/input'
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
    <div className="grid gap-3">
      {searchText && (
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={searchPlaceholder ?? `Search ${title.toLowerCase()}…`}
        />
      )}
      <Card
        title={q ? `${title} (${shown.length} of ${rows.length})` : title}
        padding={0}
        actions={<Button size="sm" onClick={() => open()}>+ Add</Button>}
      >
        {shown.length === 0 && <div className="card-row text-muted-foreground">{q ? `No matches for "${query.trim()}".` : 'Nothing here yet.'}</div>}
        {shown.map(r => (
          <div key={r.id} className="card-row flex items-center justify-between gap-3">
            <div className="min-w-0">{rowLabel(r)}</div>
            <div className="flex shrink-0 gap-1.5">
              <Button variant="outline" size="sm" onClick={() => open(r)}>Edit</Button>
              <button onClick={() => onDelete(r.id)} className="icon-btn danger" aria-label="Delete" title="Delete"><TrashIcon /></button>
            </div>
          </div>
        ))}
      </Card>
      <Modal open={!!editing} title={title} onClose={() => setEditing(null)}>
        {editing && (
          <div className="grid gap-4">
            {fields.map(f => (
              <label key={f.name} className="grid gap-1.5 text-sm font-medium">{f.label}
                {f.type === 'select'
                  ? <Select value={editing[f.name] ?? ''} onChange={e => setEditing({ ...editing, [f.name]: e.target.value })}>
                      <option value="">—</option>
                      {f.options!.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  : <Input type={f.type === 'number' ? 'number' : 'text'} value={editing[f.name] ?? ''} onChange={e => setEditing({ ...editing, [f.name]: e.target.value })} />}
              </label>
            ))}
            <Button size="lg" onClick={save}>Save</Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
