export function Stepper({ value, onChange, min = 0 }: { value: number; onChange: (n: number) => void; min?: number }) {
  const btn = { width: 40, height: 40, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: '#2A2A2A', color: '#fff', fontSize: 20, fontWeight: 700 } as const
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button style={btn} aria-label="decrease" onClick={() => onChange(Math.max(min, value - 1))}>–</button>
      <span style={{ minWidth: 28, textAlign: 'center', fontWeight: 700, color: '#fff' }}>{value}</span>
      <button style={btn} aria-label="increase" onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}
