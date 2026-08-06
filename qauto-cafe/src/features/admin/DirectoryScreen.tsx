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
