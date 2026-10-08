import type { ReactNode } from 'react'

export interface Column<T> { key: string; header: string; render?: (row: T) => ReactNode }
export function DataTable<T>({ columns, rows }: { columns: Column<T>[]; rows: T[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-sans text-sm">
        <thead>
          <tr>{columns.map(c => <th key={c.key} className="border-b border-divider bg-[#FAFAFA] px-3 py-2.5 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground">{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-[#FAFAFA]">{columns.map(c => <td key={c.key} className="border-b border-divider px-3 py-3 tabular-nums">{c.render ? c.render(r) : String((r as any)[c.key] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
