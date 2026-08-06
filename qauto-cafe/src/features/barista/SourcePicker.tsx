import { useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import type { Department, Staff } from '../../db/schema'
import { matchStaff } from '../../domain/search'
import { Modal } from '../../components/Modal'

export interface Source { staff: Staff | null; department: Department | null; walkin?: boolean; walkinName?: string }

export function SourcePicker({ data, value, onChange }: { data: Data; value: Source; onChange: (s: Source) => void }) {
  const [open, setOpen] = useState(false)
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'
  // Quick directory autocomplete for the walk-in name field.
  const nameQuery = (value.walkin ? value.walkinName ?? '' : '').trim()
  const nameSuggestions = useMemo(
    () => nameQuery.length >= 2 ? matchStaff(nameQuery, data.staff, 6).filter(s => s.name.toLowerCase() !== nameQuery.toLowerCase()) : [],
    [nameQuery, data.staff],
  )
  const label = value.walkin
    ? (value.walkinName?.trim() ? `Walk-in · ${value.walkinName.trim()}` : 'Walk-in customer (no extension)')
    : value.staff
      ? `${value.staff.name} · ${deptName(value.staff.departmentId)}`
      : value.department ? value.department.name : 'No source selected'
  const toggleWalkin = () => {
    if (value.walkin) onChange({ staff: null, department: null, walkin: false })
    else onChange({ staff: null, department: null, walkin: true, walkinName: value.walkinName ?? '' })
  }
  return (
    <div style={{ background: '#1A1A1A', color: '#fff', borderRadius: 'var(--radius)', padding: 14, display: 'grid', gap: 10 }}>
      <div style={{ fontWeight: 700 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => { onChange({ staff: value.staff, department: value.department, walkin: false }); setOpen(true) }}
          style={{ flex: 2, padding: 14, borderRadius: 10, fontWeight: 800, fontSize: 16,
            border: value.walkin ? '1px solid rgba(255,255,255,0.2)' : 'none',
            background: value.walkin ? '#2A2A2A' : '#fff', color: value.walkin ? '#fff' : '#1A1A1A' }}
        >
          {value.staff || value.department ? 'Change source' : 'Select source'}
        </button>
        <button
          onClick={toggleWalkin}
          style={{ flex: 1, padding: 14, borderRadius: 10, fontWeight: 800, fontSize: 16,
            border: value.walkin ? 'none' : '1px solid rgba(255,255,255,0.2)',
            background: value.walkin ? '#fff' : '#2A2A2A', color: value.walkin ? '#1A1A1A' : '#fff' }}
        >
          Walk-in
        </button>
      </div>
      {value.walkin && (
        <div style={{ display: 'grid', gap: 6 }}>
          <input
            autoFocus
            value={value.walkinName ?? ''}
            onChange={e => onChange({ staff: null, department: null, walkin: true, walkinName: e.target.value })}
            placeholder="Customer name (optional)"
            style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: '#2A2A2A', color: '#fff', fontSize: 16 }}
          />
          {nameSuggestions.length > 0 && (
            <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflow: 'auto' }}>
              {nameSuggestions.map(s => (
                <button
                  key={s.id}
                  onClick={() => onChange({ staff: null, department: null, walkin: true, walkinName: s.name })}
                  style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: '#2A2A2A', color: '#fff', fontSize: 15 }}
                >
                  {s.name} <span style={{ color: 'rgba(255,255,255,0.5)' }}>· {deptName(s.departmentId)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      <SourceModal open={open} data={data} onClose={() => setOpen(false)} onPick={s => { onChange({ ...s, walkin: false, walkinName: undefined }); setOpen(false) }} />
    </div>
  )
}

function SourceModal({ data, open, onClose, onPick }: { data: Data; open: boolean; onClose: () => void; onPick: (s: Source) => void }) {
  const [tab, setTab] = useState<'keypad' | 'dept'>('keypad')
  return (
    <Modal open={open} title="Select source" onClose={onClose}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={() => setTab('keypad')} style={tabStyle(tab === 'keypad')}>Search</button>
        <button onClick={() => setTab('dept')} style={tabStyle(tab === 'dept')}>By department</button>
      </div>
      {tab === 'keypad'
        ? <Keypad data={data} onPick={onPick} />
        : <DepartmentPicker data={data} onPick={onPick} />}
    </Modal>
  )
}

function Keypad({ data, onPick }: { data: Data; onPick: (s: Source) => void }) {
  // Search matches by NAME or extension — type letters (e.g. "ah" → Ahmed…) or
  // tap the number pad for an extension. matchStaff handles both.
  const [query, setQuery] = useState('')
  const results = useMemo(() => matchStaff(query, data.staff, 15), [query, data.staff])
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'
  const pickStaff = (s: Staff) => onPick({ staff: s, department: data.departments.find(d => d.id === s.departmentId) ?? null })
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back']
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <input
        autoFocus
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Type a name or extension…"
        style={{ minHeight: 56, textAlign: 'center', fontSize: 22, fontWeight: 700, border: '1px solid var(--line)', borderRadius: 10, background: '#fafafa', padding: '0 12px' }}
      />
      {query && (
        <div style={{ display: 'grid', gap: 8, maxHeight: 220, overflow: 'auto' }}>
          {results.length === 0 && <div style={{ color: 'var(--muted)', padding: 10 }}>No match for “{query}”</div>}
          {results.map(s => (
            <button key={s.id} onClick={() => pickStaff(s)} style={{ textAlign: 'left', padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: '#fff', fontSize: 16 }}>
              <strong>{s.extension}</strong> · {s.name} · <span style={{ color: 'var(--muted)' }}>{deptName(s.departmentId)}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {keys.map(k => (
          <button
            key={k}
            onClick={() => {
              if (k === 'clear') setQuery('')
              else if (k === 'back') setQuery(q => q.slice(0, -1))
              else setQuery(q => q + k)
            }}
            style={{ padding: 18, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', fontSize: 24, fontWeight: 700 }}
          >
            {k === 'back' ? '⌫' : k === 'clear' ? 'C' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

function DepartmentPicker({ data, onPick }: { data: Data; onPick: (s: Source) => void }) {
  const [dept, setDept] = useState<Department | null>(null)
  const deptName = (id: string) => data.departments.find(d => d.id === id)?.name ?? '—'
  if (!dept) {
    return (
      <div style={{ display: 'grid', gap: 8, maxHeight: 380, overflow: 'auto' }}>
        {data.departments.filter(d => d.active).map(d => (
          <button key={d.id} onClick={() => setDept(d)} style={{ textAlign: 'left', padding: 14, borderRadius: 10, border: '1px solid var(--line)', background: '#fff', fontSize: 16, fontWeight: 600 }}>
            {d.name}
          </button>
        ))}
      </div>
    )
  }
  const staff = data.staff.filter(s => s.active && s.departmentId === dept.id)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={() => setDept(null)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--line)', background: '#fff', fontWeight: 700 }}>← Back</button>
        <strong style={{ fontSize: 18 }}>{dept.name}</strong>
      </div>
      <button onClick={() => onPick({ staff: null, department: dept })} style={{ padding: 12, borderRadius: 10, border: '1px dashed var(--line)', background: '#fafafa', fontWeight: 700 }}>
        Use whole department
      </button>
      <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflow: 'auto' }}>
        {staff.length === 0 && <div style={{ color: 'var(--muted)', padding: 10 }}>No staff in this department</div>}
        {staff.map(s => (
          <button key={s.id} onClick={() => onPick({ staff: s, department: dept })} style={{ textAlign: 'left', padding: 14, borderRadius: 8, border: '1px solid var(--line)', background: '#fff', fontSize: 16, lineHeight: 1.4 }}>
            <strong>{s.extension}</strong> · {s.name} · <span style={{ color: 'var(--muted)' }}>{deptName(s.departmentId)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const tabStyle = (active: boolean) => ({
  flex: 1, padding: 12, borderRadius: 10, border: active ? 'none' : '1px solid #e5e5e5',
  background: active ? '#1A1A1A' : '#fff', color: active ? '#fff' : '#1A1A1A',
  fontWeight: 700, fontSize: 16,
} as const)
