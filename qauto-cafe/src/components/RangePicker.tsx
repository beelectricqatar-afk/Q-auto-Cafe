import { PERIOD_LABELS } from '../domain/dateRanges'
import { isPreset, PRESETS, type RangeMode, type RangeSelection } from '../domain/rangeSelection'

const input = { padding: 8, borderRadius: 8, border: '1px solid var(--line)', fontSize: 14 } as const

const chip = (active: boolean) => ({
  padding: '8px 14px', borderRadius: 8, fontWeight: 700, cursor: 'pointer',
  border: active ? 'none' : '1px solid var(--line)',
  background: active ? '#1A1A1A' : '#fff',
  color: active ? '#fff' : 'var(--ink)',
} as const)

/**
 * The named periods, plus a Custom option that reveals the month and day
 * pickers. Shared by the Dashboard and Finance so the two cannot drift apart.
 */
export function RangePicker({ value, onChange }: { value: RangeSelection; onChange: (s: RangeSelection) => void }) {
  const custom = !isPreset(value.mode)
  const set = (patch: Partial<RangeSelection>) => onChange({ ...value, ...patch })
  const pick = (mode: RangeMode) => set({ mode })

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {PRESETS.map(k => (
        <button key={k} onClick={() => pick(k)} style={chip(value.mode === k)}>{PERIOD_LABELS[k]}</button>
      ))}
      {/* Entering Custom lands on a whole month, the more common of the two. */}
      <button onClick={() => pick(custom ? value.mode : 'pickMonth')} style={chip(custom)}>Custom</button>

      {custom && (
        <>
          <div style={{ display: 'flex', border: '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
            {(['pickMonth', 'pickDays'] as const).map(m => (
              <button
                key={m}
                onClick={() => pick(m)}
                style={{ border: 'none', padding: '8px 12px', fontWeight: 700, cursor: 'pointer',
                  background: value.mode === m ? '#1A1A1A' : '#fff', color: value.mode === m ? '#fff' : 'var(--ink)' }}
              >
                {m === 'pickMonth' ? 'Month' : 'Days'}
              </button>
            ))}
          </div>
          {value.mode === 'pickMonth'
            ? <input type="month" value={value.monthKey} onChange={e => set({ monthKey: e.target.value })} style={input} aria-label="Month" />
            : (
              <>
                <input type="date" value={value.fromDay} onChange={e => set({ fromDay: e.target.value })} style={input} aria-label="From date" />
                <span style={{ color: 'var(--muted)' }}>to</span>
                <input type="date" value={value.toDay} onChange={e => set({ toDay: e.target.value })} style={input} aria-label="To date" />
              </>
            )}
        </>
      )}
    </div>
  )
}
