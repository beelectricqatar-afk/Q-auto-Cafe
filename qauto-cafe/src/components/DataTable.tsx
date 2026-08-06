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
