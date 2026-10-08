import { PERIOD_LABELS } from '../domain/dateRanges'
import { isPreset, PRESETS, type RangeMode, type RangeSelection } from '../domain/rangeSelection'
import { MonthRangePicker } from './MonthRangePicker'
import { ToggleGroup } from './ui/toggle-group'
import { Input } from './ui/input'

/**
 * The named periods, plus a Custom option that reveals the month and day
 * pickers. Month picks one month or a run of them.
 */
export function RangePicker({ value, onChange }: { value: RangeSelection; onChange: (s: RangeSelection) => void }) {
  const custom = !isPreset(value.mode)
  const set = (patch: Partial<RangeSelection>) => onChange({ ...value, ...patch })
  const pick = (mode: RangeMode) => set({ mode })

  return (
    <div className="flex flex-wrap items-center gap-2 font-sans">
      <ToggleGroup
        label="Period"
        value={custom ? 'custom' : value.mode}
        // Entering Custom lands on a whole month, the more common of the two.
        onChange={v => (v === 'custom' ? pick(custom ? value.mode : 'pickMonth') : pick(v as RangeMode))}
        options={[...PRESETS.map(k => ({ value: k as string, label: PERIOD_LABELS[k] })), { value: 'custom', label: 'Custom' }]}
      />

      {custom && (
        <>
          <ToggleGroup
            label="Custom range"
            value={value.mode}
            onChange={m => pick(m)}
            options={[{ value: 'pickMonth' as RangeMode, label: 'Month' }, { value: 'pickDays' as RangeMode, label: 'Days' }]}
          />
          {value.mode === 'pickMonth'
            ? <MonthRangePicker from={value.monthKey} to={value.toMonthKey ?? value.monthKey} onChange={(from, to) => set({ monthKey: from, toMonthKey: to })} />
            : (
              <div className="flex items-center gap-2">
                <Input type="date" value={value.fromDay} onChange={e => set({ fromDay: e.target.value })} aria-label="From date" className="w-auto" />
                <span className="text-sm text-muted-foreground">to</span>
                <Input type="date" value={value.toDay} onChange={e => set({ toDay: e.target.value })} aria-label="To date" className="w-auto" />
              </div>
            )}
        </>
      )}
    </div>
  )
}
