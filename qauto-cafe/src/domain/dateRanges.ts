// Named time windows used by the Dashboard and Billing filters.
export type PeriodKey = 'today' | 'week' | 'month' | 'all'
export interface Period { key: PeriodKey; label: string; from: number; to: number } // [from, to)

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  today: 'Today', week: 'This week', month: 'This month', all: 'All time',
}

// `now` is injectable for testing; defaults to the current time.
export function periodRange(key: PeriodKey, now: Date = new Date()): Period {
  const start = new Date(now); start.setHours(0, 0, 0, 0)
  const to = Number.MAX_SAFE_INTEGER
  switch (key) {
    case 'today':
      return { key, label: PERIOD_LABELS.today, from: start.getTime(), to }
    case 'week': {
      const d = new Date(start)
      const dow = (d.getDay() + 6) % 7 // Monday = 0
      d.setDate(d.getDate() - dow)
      return { key, label: PERIOD_LABELS.week, from: d.getTime(), to }
    }
    case 'month': {
      const d = new Date(now.getFullYear(), now.getMonth(), 1)
      return { key, label: PERIOD_LABELS.month, from: d.getTime(), to }
    }
    case 'all':
    default:
      return { key, label: PERIOD_LABELS.all, from: 0, to }
  }
}
