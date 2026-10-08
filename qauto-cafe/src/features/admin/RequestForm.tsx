import { useState } from 'react'
import type { Branch, Ingredient, Request, RequestLine } from '../../db/schema'
import { Card } from '../../components/Card'
import { ItemPicker } from '../../components/ItemPicker'
import { useToast } from '../../components/Toast'
import { BULK_UNIT } from '../../domain/purchase'
import { CAFES, CAFE_LABEL, requestMessage } from '../../domain/shoppingList'
import { TrashIcon } from './sidebarIcons'
import { Button } from '../../components/ui/button'
import { Input, Select } from '../../components/ui/input'
import { ToggleGroup } from '../../components/ui/toggle-group'

interface DraftLine {
  key: string
  ingredient?: Ingredient
  name: string
  qty: string
  /** Asked for in L / kg rather than ml / g. */
  bulk: boolean
  /** For something not in the inventory: "boxes", "packs". */
  unitLabel: string
}
interface Section { key: string; branch: Branch; lines: DraftLine[] }

const newSection = (branch: Branch): Section => ({ key: crypto.randomUUID(), branch, lines: [] })

/**
 * Asking for stock, one cafe section at a time — a single request still covers
 * both cafes, as the team has always written them, but each item is picked
 * with its quantity so the shopping list can add them up exactly.
 */
export function RequestForm({ ingredients, onSend }: { ingredients: Ingredient[]; onSend: (request: Request) => Promise<void> }) {
  const toast = useToast()
  const [from, setFrom] = useState('')
  const [sections, setSections] = useState<Section[]>(() => [newSection('volkswagen')])
  const [tried, setTried] = useState(false)
  const [sending, setSending] = useState(false)

  const used = new Set(sections.map(s => s.branch))
  const free = CAFES.filter(c => !used.has(c))
  const lines = sections.flatMap(s => s.lines)
  const missingQty = (l: DraftLine) => !(Number(l.qty) > 0)

  const updateSection = (key: string, patch: (s: Section) => Section) => setSections(ss => ss.map(s => (s.key === key ? patch(s) : s)))
  const updateLine = (sectionKey: string, lineKey: string, patch: Partial<DraftLine>) =>
    updateSection(sectionKey, s => ({ ...s, lines: s.lines.map(l => (l.key === lineKey ? { ...l, ...patch } : l)) }))

  const add = (section: Section, pick: Ingredient | string) => {
    if (typeof pick !== 'string' && section.lines.some(l => l.ingredient?.id === pick.id)) {
      toast(`${pick.name} is already on the ${CAFE_LABEL[section.branch]} list`, 'warn')
      return
    }
    const line: DraftLine = typeof pick === 'string'
      ? { key: crypto.randomUUID(), name: pick.charAt(0).toUpperCase() + pick.slice(1), qty: '', bulk: false, unitLabel: '' }
      : { key: crypto.randomUUID(), ingredient: pick, name: pick.name, qty: '', bulk: !!BULK_UNIT[pick.unit], unitLabel: '' }
    updateSection(section.key, s => ({ ...s, lines: [...s.lines, line] }))
  }

  const problem = !lines.length
    ? 'Add at least one item.'
    : lines.some(missingQty)
      ? `Enter how many for ${lines.filter(missingQty).map(l => l.name).join(', ')}.`
      : null

  const send = async () => {
    setTried(true)
    if (problem || sending) return
    const requestLines: RequestLine[] = sections.flatMap(s => s.lines.map(l => {
      const factor = l.ingredient && l.bulk ? BULK_UNIT[l.ingredient.unit]?.factor ?? 1 : 1
      return {
        id: crypto.randomUUID(),
        branch: s.branch,
        name: l.name,
        qty: Math.round(Number(l.qty) * factor * 1000) / 1000,
        ...(l.ingredient ? { ingredientId: l.ingredient.id, unit: l.ingredient.unit } : l.unitLabel.trim() ? { unitLabel: l.unitLabel.trim() } : {}),
      }
    }))
    setSending(true)
    try {
      await onSend({ id: crypto.randomUUID(), timestamp: Date.now(), from: from.trim() || undefined, done: false, lines: requestLines, message: requestMessage(requestLines) })
      setSections([newSection('volkswagen')])
      setTried(false)
    } finally {
      setSending(false)
    }
  }

  return (
    <Card title="Send a request to the admin" style={{ overflow: 'visible' }}>
      <div className="grid gap-4">
        <Input value={from} onChange={e => setFrom(e.target.value)} placeholder="Your name (optional)" />

        {sections.map(section => (
          <div key={section.key} className="grid gap-3 rounded-control border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <Select
                value={section.branch}
                onChange={e => updateSection(section.key, s => ({ ...s, branch: e.target.value as Branch }))}
                aria-label="Cafe"
                className="w-auto text-sm font-semibold tracking-wide uppercase"
              >
                {CAFES.filter(c => c === section.branch || !used.has(c)).map(c => <option key={c} value={c}>{CAFE_LABEL[c]}</option>)}
              </Select>
              {sections.length > 1 && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSections(ss => ss.filter(s => s.key !== section.key))}>
                  Remove {CAFE_LABEL[section.branch]}
                </Button>
              )}
            </div>

            {section.lines.map(l => {
              const bulk = l.ingredient && BULK_UNIT[l.ingredient.unit]
              const err = tried && missingQty(l)
              return (
                <div key={l.key} className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-[1_1_140px]">
                    <div className="font-semibold">{l.name}</div>
                    <div className="text-xs text-muted-foreground">{l.ingredient ? `${l.ingredient.stockQty} ${l.ingredient.unit} in stock` : 'not a stock item'}</div>
                  </div>
                  <Input type="number" min="0" step="any" inputMode="decimal" value={l.qty}
                    onChange={e => updateLine(section.key, l.key, { qty: e.target.value })}
                    aria-label={`How many ${l.name} for ${CAFE_LABEL[section.branch]}`} aria-invalid={err}
                    className="w-24" />
                  {bulk && l.ingredient
                    ? <ToggleGroup
                        size="sm"
                        label={`Unit for ${l.name}`}
                        value={l.bulk ? 'bulk' : 'stock'}
                        onChange={v => updateLine(section.key, l.key, { bulk: v === 'bulk' })}
                        options={[{ value: 'bulk', label: bulk.unit }, { value: 'stock', label: l.ingredient.unit }]}
                      />
                    : l.ingredient
                      ? <span className="min-w-8 text-sm font-semibold text-muted-foreground">{l.ingredient.unit}</span>
                      : <Input value={l.unitLabel} onChange={e => updateLine(section.key, l.key, { unitLabel: e.target.value })} placeholder="unit"
                          aria-label={`Unit for ${l.name}`} className="w-20" />}
                  <button type="button" className="icon-btn danger" aria-label={`Remove ${l.name} from ${CAFE_LABEL[section.branch]}`}
                    onClick={() => updateSection(section.key, s => ({ ...s, lines: s.lines.filter(x => x.key !== l.key) }))}><TrashIcon /></button>
                </div>
              )
            })}

            <ItemPicker
              ingredients={ingredients}
              onPick={pick => add(section, pick)}
              label={`Add an item for ${CAFE_LABEL[section.branch]}`}
              placeholder="Add item, e.g. milk"
              freeNote=""
            />
          </div>
        ))}

        {free.length > 0 && (
          <Button variant="outline" size="sm" className="justify-self-start" onClick={() => setSections(ss => [...ss, newSection(free[0])])}>
            + Add {CAFE_LABEL[free[0]]}
          </Button>
        )}

        {tried && problem && <div role="alert" className="text-sm font-semibold text-destructive">{problem}</div>}
        <Button size="lg" onClick={send} disabled={sending}>
          {sending ? 'Sending…' : 'Send request'}
        </Button>
      </div>
    </Card>
  )
}
