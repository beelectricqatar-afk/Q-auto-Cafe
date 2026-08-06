import { useState } from 'react'
import type { Data } from '../../app/useData'
import type { MenuItem } from '../../db/schema'
import { formatQar } from '../../domain/money'

export function MenuGrid({ data, onPick }: { data: Data; onPick: (i: MenuItem) => void }) {
  const cats = [...data.categories].sort((a, b) => a.sortOrder - b.sortOrder)
  const [catId, setCatId] = useState(cats[0]?.id ?? '')
  const items = data.menuItems.filter(i => i.active && i.categoryId === catId)
  const tile = { borderRadius: 16, border: '1px solid #e5e5e5', background: '#fff', padding: 16, minHeight: 88, fontWeight: 700, display: 'grid', alignContent: 'center', gap: 6 } as const
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, height: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {cats.map(c => (
          <button
            key={c.id}
            onClick={() => setCatId(c.id)}
            style={{
              padding: '10px 16px', borderRadius: 10, fontWeight: 700,
              border: c.id === catId ? 'none' : '1px solid #e5e5e5',
              background: c.id === catId ? '#1A1A1A' : '#fff',
              color: c.id === catId ? '#fff' : '#1A1A1A',
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, overflow: 'auto', alignContent: 'start' }}>
        {items.map(i => (
          <button key={i.id} onClick={() => onPick(i)} style={tile}>
            <span>{i.name}</span>
            {/* Add-ons are free; anything else priced at 0 still shows it, so a
                missing price stays visible rather than reading as deliberate. */}
            <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{i.addOn ? 'Free' : formatQar(i.price)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
