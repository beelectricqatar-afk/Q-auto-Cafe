import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('renders its title, actions and children', () => {
    render(<Card title="Inventory" actions={<button>+ Add</button>}><p>rows</p></Card>)
    expect(screen.getByRole('heading', { name: 'Inventory' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
    expect(screen.getByText('rows')).toBeInTheDocument()
  })

  it('lets a caller override its defaults, including the corner clipping', () => {
    // Cards clip to their rounded corners, which cuts off anything positioned
    // outside them — a type-ahead list, say. Callers must be able to opt out,
    // which only works while `style` is spread after the defaults.
    const { container } = render(<Card title="Requests" style={{ overflow: 'visible' }}>x</Card>)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.overflow).toBe('visible')
    expect(root.style.borderRadius).toBe('16px') // other defaults survive
  })

  it('clips by default', () => {
    const { container } = render(<Card title="Plain">x</Card>)
    expect((container.firstElementChild as HTMLElement).style.overflow).toBe('hidden')
  })
})
