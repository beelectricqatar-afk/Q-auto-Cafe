import type { CSSProperties, ReactNode } from 'react'

export function Card({ title, actions, padding = 24, style, hoverable = false, children }: {
  title?: ReactNode
  actions?: ReactNode
  padding?: number
  style?: CSSProperties
  hoverable?: boolean
  children?: ReactNode
}) {
  return (
    <div className={hoverable ? 'card-hoverable' : undefined} style={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: 16, overflow: 'hidden', ...style }}>
      {title && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '16px 24px', borderBottom: children ? '1px solid #e5e5e5' : 'none' }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: '#1a1a1a' }}>{title}</h3>
          {actions}
        </div>
      )}
      {children != null && <div style={{ padding }}>{children}</div>}
    </div>
  )
}
