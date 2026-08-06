import type { ComponentType, CSSProperties } from 'react'

export function MetricCard({ icon: Icon, label, value, tone = 'normal', valueSize = 30, style }: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'good' | 'bad' | 'normal'
  valueSize?: number
  style?: CSSProperties
}) {
  const color = tone === 'good' ? '#106b43' : tone === 'bad' ? '#d92d20' : '#1a1a1a'
  return (
    <div className="card-hoverable" style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, padding: 24, display: 'flex', flexDirection: 'column', gap: 20, height: '100%', ...style }}>
      <div style={{ background: '#f2f2f2', borderRadius: 12, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1a1a1a' }}>
        <Icon className="metric-card-icon" />
      </div>
      <div>
        <div style={{ fontSize: 14, color: '#999' }}>{label}</div>
        <div style={{ fontSize: valueSize, fontWeight: 700, lineHeight: `${valueSize + 8}px`, color }}>{value}</div>
      </div>
    </div>
  )
}
