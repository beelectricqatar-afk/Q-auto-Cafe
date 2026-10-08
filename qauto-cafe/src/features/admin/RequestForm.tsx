import { useState, type CSSProperties } from 'react'
import type { Branch, Ingredient, Request, RequestLine } from '../../db/schema'
import { Card } from '../../components/Card'
import { ItemPicker } from '../../components/ItemPicker'
import { useToast } from '../../components/Toast'
import { BULK_UNIT } from '../../domain/purchase'
import { CAFES, CAFE_LABEL, requestMessage } from '../../domain/shoppingList'
import { TrashIcon } from './sidebarIcons'

const INK = '#1A1A1A'
const input: CSSProperties = { padding: 10, borderRadius: 8, border: '1px solid var(--line)', fontSize: 16, background: '#fff', color: 'var(--ink)' }
const bad = (on: boolean): CSSProperties => (on ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 1px var(--danger)' } : {})

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
      <div style={{ display: 'grid', gap: 14 }}>
        <input value={from} onChange={e => setFrom(e.target.value)} placeholder="Your name (optional)" style={input} />

        {sections.map(section => (
          <div key={section.key} style={{ border: '1px solid #e5e5e5', borderRadius: 12, padding: 12, display: 'grid', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <select
                value={section.branch}
                onChange={e => updateSection(section.key, s => ({ ...s, branch: e.target.value as Branch }))}
                aria-label="Cafe"
                style={{ ...input, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 14 }}
              >
                {CAFES.filter(c => c === section.branch || !used.has(c)).map(c => <option key={c} value={c}>{CAFE_LABEL[c]}</option>)}
              </select>
              {sections.length > 1 && (
                <button type="button" onClick={() => setSections(ss => ss.filter(s => s.key !== section.key))}
                  style={{ border: 'none', background: 'none', color: 'var(--muted)', fontWeight: 700, minHeight: 32 }}>
                  Remove {CAFE_LABEL[section.branch]}
                </button>
              )}
            </div>

            {section.lines.map(l => {
              const bulk = l.ingredient && BULK_UNIT[l.ingredient.unit]
              const err = tried && missingQty(l)
              return (
                <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 140px', minWidth: 0 }}>
                    <div style={{ fontWeight: 700 }}>{l.name}</div>
                    <div style={{ color: 'var(--muted)', fontSize: 13 }}>{l.ingredient ? `${l.ingredient.stockQty} ${l.ingredient.unit} in stock` : 'not a stock item'}</div>
                  </div>
                  <input type="number" min="0" step="any" inputMode="decimal" value={l.qty}
                    onChange={e => updateLine(section.key, l.key, { qty: e.target.value })}
                    aria-label={`How many ${l.name} for ${CAFE_LABEL[section.branch]}`} aria-invalid={err}
                    style={{ ...input, ...bad(err), width: 90 }} />
                  {bulk && l.ingredient
                    ? <div role="group" aria-label={`Unit for ${l.name}`} style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                        {[true, false].map(b => (
                          <button key={String(b)} type="button" aria-pressed={l.bulk === b} onClick={() => updateLine(section.key, l.key, { bulk: b })}
                            style={{ border: 'none', padding: '0 10px', minHeight: 42, fontWeight: 700, background: l.bulk === b ? INK : '#fff', color: l.bulk === b ? '#fff' : 'var(--ink)' }}>
                            {b ? bulk.unit : l.ingredient!.unit}
                          </button>
                        ))}
                      </div>
                    : l.ingredient
                      ? <span style={{ color: 'var(--muted)', fontWeight: 600, minWidth: 34 }}>{l.ingredient.unit}</span>
                      : <input value={l.unitLabel} onChange={e => updateLine(section.key, l.key, { unitLabel: e.target.value })} placeholder="unit"
                          aria-label={`Unit for ${l.name}`} style={{ ...input, width: 80 }} />}
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
          <button type="button" onClick={() => setSections(ss => [...ss, newSection(free[0])])}
            style={{ justifySelf: 'start', border: '1px solid #e5e5e5', background: '#fff', borderRadius: 8, padding: '8px 14px', fontWeight: 700 }}>
            + Add {CAFE_LABEL[free[0]]}
          </button>
        )}

        {tried && problem && <div role="alert" style={{ color: 'var(--danger)', fontSize: 14, fontWeight: 600 }}>{problem}</div>}
        <button onClick={send} disabled={sending} style={{ background: INK, color: '#fff', border: 'none', borderRadius: 10, padding: 14, fontWeight: 800, fontSize: 16, opacity: sending ? 0.7 : 1 }}>
          {sending ? 'Sending…' : 'Send request'}
        </button>
      </div>
    </Card>
  )
}
