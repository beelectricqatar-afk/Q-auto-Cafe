import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Ingredient, Unit, InventoryAdjustment } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { useToast } from '../../components/Toast'
import { Card } from '../../components/Card'
import { subDivision } from '../../domain/deduction'

// Order roughly by how often they are picked, volume then weight then counts.
const UNITS: Unit[] = ['ml', 'L', 'g', 'kg', 'pcs', 'shot', 'oz', 'slices', 'leaves', 'bag', 'bundle']

export function InventoryScreen({ data, refresh }: { data: Data; refresh: () => Promise<void> }) {
  const toast = useToast()
  const [adjusting, setAdjusting] = useState<Ingredient | null>(null)
  const [delta, setDelta] = useState('')
  // Bundles vary in size, so the conversion is editable here as well as on the
  // edit form — the moment stock arrives is when its real yield is known.
  const [per, setPer] = useState('')
  const openAdjust = (i: Ingredient) => { setAdjusting(i); setDelta(''); setPer(String(i.subUnitPer ?? '')) }
  const closeAdjust = () => { setAdjusting(null); setDelta(''); setPer('') }

  const applyAdjust = async () => {
    if (!adjusting) return
    const d = Number(delta) || 0
    const nextPer = Number(per) || 0
    const perChanged = !!adjusting.subUnit && nextPer !== (adjusting.subUnitPer ?? 0)
    if (!d && !perChanged) { closeAdjust(); return }

    const ing: Ingredient = {
      ...adjusting,
      stockQty: Math.round((adjusting.stockQty + d) * 1000) / 1000,
      ...(perChanged && { subUnitPer: nextPer }),
    }
    await repo.put('ingredients', ing)
    if (d) {
      const adj: InventoryAdjustment = { id: crypto.randomUUID(), timestamp: Date.now(), ingredientId: ing.id, delta: d, reason: 'restock' }
      await repo.put('inventoryAdjustments', adj)
    }
    closeAdjust(); await refresh()
    toast(d ? 'Stock updated' : `Now ${nextPer} ${adjusting.subUnit} per ${adjusting.unit}`)
  }
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <CrudList<Ingredient>
        title="Inventory"
        rows={data.ingredients}
        searchText={i => `${i.name} ${i.unit}`}
        searchPlaceholder="Search ingredients by name or unit…"
        fields={[
          { name: 'name', label: 'Name' },
          { name: 'unit', label: 'Unit', type: 'select', options: UNITS.map(u => ({ value: u, label: u })) },
          { name: 'stockQty', label: 'Current stock', type: 'number' },
          { name: 'lowStockThreshold', label: 'Low-stock threshold', type: 'number' },
          { name: 'unitCostQar', label: 'Unit cost (QAR)', type: 'number' },
          { name: 'subUnit', label: 'Sub-unit (optional)', type: 'select', options: UNITS.map(u => ({ value: u, label: u })) },
          { name: 'subUnitPer', label: 'Sub-units per unit (e.g. 1 lemon = 10 slices)', type: 'number' },
        ]}
        rowLabel={i => {
          // Recipes for a sub-divided ingredient are written in sub-units, and
          // stock still moves in whole units — so show the part-used one too.
          const sub = subDivision(i)
          // Naming a sub-unit without a conversion does nothing, so say so
          // rather than silently leaving recipes measured in whole units.
          const halfSet = !!i.subUnit && sub.per === 1
          return (
            <span>
              <strong>{i.name}</strong> - {i.stockQty}{i.unit}
              {sub.per > 1 && <span style={{ color: 'var(--muted)' }}> - {i.openSubQty ?? 0} {sub.unit} open - {sub.per} {sub.unit}/{i.unit}</span>}
              {i.unitCostQar != null && <span style={{ color: 'var(--muted)' }}> - {i.unitCostQar} QAR/{i.unit}</span>}
              {' '}
              {halfSet && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>SET {i.subUnit!.toUpperCase()} PER {i.unit.toUpperCase()}</span>}
              {' '}
              {i.stockQty <= i.lowStockThreshold && <span style={{ color: 'var(--danger)', fontWeight: 700 }}>LOW</span>}
              <button onClick={() => openAdjust(i)} style={{ marginLeft: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '2px 10px', background: '#fff' }}>Adjust</button>
            </span>
          )
        }}
        empty={() => ({ name: '', unit: 'ml', stockQty: 0, lowStockThreshold: 0 })}
        onSave={async r => { await repo.put('ingredients', r); await refresh() }}
        onDelete={async id => { await repo.remove('ingredients', id); await refresh() }}
      />
      {adjusting && (
        <Card title={`Adjust ${adjusting.name}`}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Always in whole stocked units, never sub-units — an opened unit is
                tracked separately and is left alone by an adjustment. */}
            <span style={{ color: 'var(--muted)' }}>
              In {adjusting.unit} - e.g. +5000 received, -200 wastage:
            </span>
            <input type="number" value={delta} onChange={e => setDelta(e.target.value)} aria-label={`Adjust by, in ${adjusting.unit}`} style={{ padding: 8, borderRadius: 8, border: '1px solid var(--line)' }} />

            {/* Set the yield as stock arrives — this bundle may not match the last. */}
            {adjusting.subUnit && (
              <>
                <span style={{ color: 'var(--muted)', borderLeft: '1px solid var(--line)', paddingLeft: 16 }}>
                  {adjusting.subUnit} per {adjusting.unit}:
                </span>
                <input
                  type="number"
                  value={per}
                  onChange={e => setPer(e.target.value)}
                  aria-label={`${adjusting.subUnit} per ${adjusting.unit}`}
                  style={{ width: 90, padding: 8, borderRadius: 8, border: '1px solid var(--line)' }}
                />
              </>
            )}

            <button onClick={applyAdjust} style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700 }}>Apply</button>
          </div>
        </Card>
      )}
    </div>
  )
}
