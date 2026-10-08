import { useState } from 'react'
import type { Data } from '../../app/useData'
import { repo } from '../../db/repo'
import type { Ingredient, Unit, InventoryAdjustment } from '../../db/schema'
import { CrudList } from '../../components/CrudList'
import { useToast } from '../../components/Toast'
import { Card } from '../../components/Card'
import { subDivision, subUnitUnset } from '../../domain/deduction'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Badge } from '../../components/ui/badge'

// Order roughly by how often they are picked, volume then weight then counts.
const UNITS: Unit[] = ['ml', 'L', 'g', 'kg', 'pcs', 'pc', 'shot', 'oz', 'slices', 'leaves', 'bag', 'bottle', 'bundle']

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
    <div className="grid gap-4">
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
          const halfSet = subUnitUnset(i)
          // A conversion of 1 is a real setting — one whole unit per serving —
          // so it is shown like any other. It just never leaves a part-used
          // unit behind, which is why the "open" count goes with per > 1.
          const divided = !!i.subUnit && !halfSet
          return (
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <strong className="font-semibold">{i.name}</strong>
                {i.stockQty <= i.lowStockThreshold && <Badge variant="danger">LOW</Badge>}
                {halfSet && <Badge variant="danger">SET {i.subUnit!.toUpperCase()} PER {i.unit.toUpperCase()}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                <span className="font-semibold text-foreground">{i.stockQty}{i.unit}</span>
                {divided && <span>{sub.per > 1 ? ` · ${i.openSubQty ?? 0} ${sub.unit} open` : ''} · {sub.per} {sub.unit}/{i.unit}</span>}
                {i.unitCostQar != null && <span> · {i.unitCostQar} QAR/{i.unit}</span>}
              </div>
              <Button variant="outline" size="sm" className="mt-1 h-8 justify-self-start px-3 text-xs" onClick={() => openAdjust(i)}>Adjust</Button>
            </div>
          )
        }}
        empty={() => ({ name: '', unit: 'ml', stockQty: 0, lowStockThreshold: 0 })}
        onSave={async r => { await repo.put('ingredients', r); await refresh() }}
        onDelete={async id => { await repo.remove('ingredients', id); await refresh() }}
      />
      {adjusting && (
        <Card title={`Adjust ${adjusting.name}`}>
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Always in whole stocked units, never sub-units — an opened unit is
                tracked separately and is left alone by an adjustment. */}
            <span className="text-sm text-muted-foreground">
              In {adjusting.unit} - e.g. +5000 received, -200 wastage:
            </span>
            <Input type="number" value={delta} onChange={e => setDelta(e.target.value)} aria-label={`Adjust by, in ${adjusting.unit}`} className="w-36" />

            {/* Set the yield as stock arrives — this bundle may not match the last. */}
            {adjusting.subUnit && (
              <>
                <span className="border-l border-border pl-4 text-sm text-muted-foreground">
                  {adjusting.subUnit} per {adjusting.unit}:
                </span>
                <Input
                  type="number"
                  value={per}
                  onChange={e => setPer(e.target.value)}
                  aria-label={`${adjusting.subUnit} per ${adjusting.unit}`}
                  className="w-24"
                />
              </>
            )}

            <Button onClick={applyAdjust}>Apply</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
