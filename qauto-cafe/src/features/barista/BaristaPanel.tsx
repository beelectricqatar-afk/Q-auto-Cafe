import { useMemo, useState } from 'react'
import type { Data } from '../../app/useData'
import type { Branch, Ingredient, MenuItem, PaymentMethod } from '../../db/schema'
import { SourcePicker, type Source } from './SourcePicker'
import { MenuGrid } from './MenuGrid'
import { Ticket } from './Ticket'
import { useTicket, type TicketLine } from './useTicket'
import { placeOrder } from './placeOrder'
import { useToast } from '../../components/Toast'
import { Modal } from '../../components/Modal'
import { recipeFor } from '../../domain/deduction'
import { milkPair, milkUsed, swapMilk } from '../../domain/milk'
import { BRANCHES, branchLabel } from '../../domain/branch'
import { PAYMENT_METHODS, paymentLabel } from '../../domain/payment'
import { DollarIcon, WalletIcon } from '../admin/sidebarIcons'
import audiLogo from '../../assets/brand/audi.jpg'
import volkswagenLogo from '../../assets/brand/volkswagen.jpg'

const BRANCH_LOGOS: Record<Branch, string> = { audi: audiLogo, volkswagen: volkswagenLogo }
import { repo } from '../../db/repo'

export function BaristaPanel({ data, onPlaced }: { data: Data; onPlaced: () => void }) {
  const [source, setSource] = useState<Source>({ staff: null, department: null })
  const [discount, setDiscount] = useState(false)
  // Only a milk drink asks anything: which of the two milks to pour. `line` is
  // set when changing the milk on something already on the ticket.
  const [pending, setPending] = useState<{ item: MenuItem; line?: TicketLine } | null>(null)
  // Placing asks two things before the order is written: which cafe, then how
  // it was paid. `pendingBranch` holds the first answer while the second is asked.
  const [choosingBranch, setChoosingBranch] = useState(false)
  const [pendingBranch, setPendingBranch] = useState<Branch | null>(null)
  const ticket = useTicket()
  const toast = useToast()
  // Items alone are enough to place — the button goes white and live as soon as
  // something is on the ticket. With no source chosen, placeOrder records the
  // order as a walk-in with no name.
  const canPlace = ticket.lines.length > 0

  const milk = useMemo(() => milkPair(data.ingredients), [data.ingredients])
  const milkOf = (line: TicketLine) => milk ? milkUsed(recipeFor(line, data.menuItems), milk) : null

  const pick = (item: MenuItem) => {
    // Anything without milk goes straight on the ticket, as before.
    if (milk && milkUsed(item.recipe, milk)) setPending({ item })
    else ticket.add(item)
  }

  const changeMilk = (line: TicketLine) => {
    const item = data.menuItems.find(i => i.id === line.itemId)
    if (!item) { toast('That item is no longer on the menu', 'warn'); return }
    setPending({ item, line })
  }

  const chooseMilk = (chosen: Ingredient) => {
    if (!pending || !milk) return
    const { item, line } = pending
    const base = line ? recipeFor(line, data.menuItems) : item.recipe
    const current = milkUsed(base, milk)
    const recipe = current && current.id !== chosen.id ? swapMilk(base, current.id, chosen.id) : base
    if (line) ticket.setRecipe(line.key, recipe, item)
    else ticket.add(item, recipe)
    setPending(null)
  }

  const place = async (branch: Branch, paymentMethod: PaymentMethod) => {
    setPendingBranch(null)
    await placeOrder({
      staffId: source.staff?.id ?? null,
      departmentId: source.department?.id ?? source.staff?.departmentId ?? null,
      lines: ticket.orderLines,
      walkin: source.walkin,
      customerName: source.walkinName,
      discountPct: discount ? 15 : 0,
      branch,
      paymentMethod,
    })
    const ings = await repo.all<Ingredient>('ingredients')
    const low = ings.filter(i => i.stockQty <= i.lowStockThreshold)
    toast(`Order placed${low.length ? ` · ${low.length} item(s) low on stock` : ''}`, low.length ? 'warn' : 'ok')
    ticket.clear(); setSource({ staff: null, department: null }); setDiscount(false); onPlaced()
  }

  const currentMilk = pending && milk
    ? milkUsed(pending.line ? recipeFor(pending.line, data.menuItems) : pending.item.recipe, milk)
    : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '440px 1fr', gap: 12, padding: 12, height: '100%', background: '#f9fafb' }}>
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', gap: 12, minHeight: 0 }}>
        <SourcePicker data={data} value={source} onChange={setSource} />
        <Ticket
          lines={ticket.lines}
          total={ticket.total}
          onQty={ticket.setQty}
          milkOf={milkOf}
          lactoseFreeId={milk?.lactoseFree.id}
          onChangeMilk={changeMilk}
          onClear={ticket.clear}
          onPlace={() => setChoosingBranch(true)}
          canPlace={canPlace}
          discount={discount}
          onToggleDiscount={() => setDiscount(d => !d)}
        />
      </div>
      <MenuGrid data={data} onPick={pick} />

      <Modal open={choosingBranch} title="Which cafe is this order for?" onClose={() => setChoosingBranch(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {BRANCHES.map(b => (
            <button
              key={b}
              onClick={() => { setChoosingBranch(false); setPendingBranch(b) }}
              style={{
                aspectRatio: '1 / 1', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 12,
                borderRadius: 16, padding: 16, cursor: 'pointer', textAlign: 'center',
                border: 'none', background: '#1A1A1A', color: '#fff',
              }}
            >
              <img
                src={BRANCH_LOGOS[b]}
                alt=""
                style={{ width: '58%', maxHeight: '52%', objectFit: 'contain' }}
              />
              <span style={{ fontSize: 20, fontWeight: 800 }}>{branchLabel(b)}</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={!!pendingBranch}
        title={`How is this ${branchLabel(pendingBranch ?? undefined)} order paid?`}
        onClose={() => setPendingBranch(null)}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {PAYMENT_METHODS.map(m => {
            const Icon = m === 'cash' ? DollarIcon : WalletIcon
            return (
              <button
                key={m}
                onClick={() => pendingBranch && place(pendingBranch, m)}
                style={{
                  aspectRatio: '1 / 1', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 12,
                  borderRadius: 16, padding: 16, cursor: 'pointer', textAlign: 'center',
                  border: 'none', background: '#1A1A1A', color: '#fff',
                }}
              >
                <Icon className="pay-icon" />
                <span style={{ fontSize: 20, fontWeight: 800 }}>{paymentLabel(m)}</span>
              </button>
            )
          })}
        </div>
      </Modal>

      <Modal open={!!pending} title={`Milk for ${pending?.item.name ?? ''}`} onClose={() => setPending(null)}>
        {milk && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[milk.fresh, milk.lactoseFree].map(option => {
              const selected = currentMilk?.id === option.id
              return (
                <button
                  key={option.id}
                  onClick={() => chooseMilk(option)}
                  style={{
                    aspectRatio: '1 / 1', display: 'grid', alignContent: 'center', justifyItems: 'center', gap: 8,
                    borderRadius: 16, padding: 16, cursor: 'pointer', textAlign: 'center',
                    border: selected ? '2px solid #1A1A1A' : '1px solid var(--line)',
                    background: selected ? '#1A1A1A' : '#fff',
                    color: selected ? '#fff' : 'var(--ink)',
                  }}
                >
                  <span style={{ fontSize: 20, fontWeight: 800 }}>{option.name}</span>
                  <span style={{ fontSize: 13, color: selected ? 'rgba(255,255,255,0.65)' : 'var(--muted)' }}>
                    {option.stockQty}{option.unit} in stock
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </Modal>
    </div>
  )
}
