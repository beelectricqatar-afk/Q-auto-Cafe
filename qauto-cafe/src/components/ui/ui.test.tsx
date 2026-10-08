import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './button'
import { Input, Select } from './input'
import { Field } from './label'
import { Badge } from './badge'
import { Checkbox } from './checkbox'
import { ToggleGroup } from './toggle-group'
import { Card, CardHeader, CardTitle } from './card'
import { cn } from '../../lib/utils'

describe('cn', () => {
  it('lets a later class win over an earlier one of the same kind', () => {
    expect(cn('px-5 h-control', 'px-3')).toBe('h-control px-3')
    const off = false
    expect(cn('a', off && 'b', undefined, 'c')).toBe('a c')
  })
})

describe('Button', () => {
  it('is a plain button unless told otherwise, so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('takes its look from the variant and size', () => {
    render(<><Button variant="destructive" size="sm">Delete</Button><Button variant="outline" size="icon" aria-label="Undo" /></>)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/bg-destructive/)
    expect(screen.getByRole('button', { name: 'Delete' }).className).toMatch(/h-control-sm/)
    expect(screen.getByRole('button', { name: 'Undo' }).className).toMatch(/size-control-sm/)
  })

  it('runs its click handler, and not when disabled', async () => {
    const click = vi.fn()
    render(<><Button onClick={click}>Go</Button><Button onClick={click} disabled>Off</Button></>)
    await userEvent.click(screen.getByRole('button', { name: 'Go' }))
    await userEvent.click(screen.getByRole('button', { name: 'Off' }))
    expect(click).toHaveBeenCalledTimes(1)
  })
})

describe('Field and Input', () => {
  it('ties the label to the field and marks it required', () => {
    render(<Field label="Vendor" htmlFor="v" required><Input id="v" /></Field>)
    expect(screen.getByLabelText(/Vendor/)).toBeInTheDocument()
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('shows the error in place of the hint', () => {
    render(<Field label="Receipt number" htmlFor="r" hint="As printed" error="Copy the number printed on the receipt."><Input id="r" aria-invalid /></Field>)
    expect(screen.getByRole('alert')).toHaveTextContent('Copy the number printed on the receipt.')
    expect(screen.queryByText('As printed')).not.toBeInTheDocument()
  })

  it('shows a unit inside the field without it being part of the value', async () => {
    render(<Input aria-label="Paid" suffix="QAR" />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Paid' }), '39')
    expect(screen.getByRole('textbox', { name: 'Paid' })).toHaveValue('39')
    expect(screen.getByText('QAR')).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers a native select', () => {
    render(<Select aria-label="Category"><option>Supplies</option></Select>)
    expect(screen.getByRole('combobox', { name: 'Category' })).toHaveValue('Supplies')
  })
})

describe('ToggleGroup', () => {
  function PaidBy() {
    const [v, setV] = useState<'Cash' | 'Card'>('Cash')
    return <ToggleGroup label="Paid by" value={v} onChange={setV} options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }]} />
  }

  it('has exactly one option pressed, and moves it on a tap', async () => {
    render(<PaidBy />)
    expect(screen.getByRole('group', { name: 'Paid by' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Card' }))
    expect(screen.getByRole('button', { name: 'Card' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cash' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('fills the picked option black', () => {
    render(<PaidBy />)
    expect(screen.getByRole('button', { name: 'Cash' }).className).toMatch(/bg-primary/)
    expect(screen.getByRole('button', { name: 'Card' }).className).not.toMatch(/bg-primary/)
  })
})

describe('Checkbox, Badge and Card', () => {
  it('ticks like a checkbox', async () => {
    render(<label><Checkbox /> Bought Orange</label>)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Bought Orange' }))
    expect(screen.getByRole('checkbox', { name: 'Bought Orange' })).toBeChecked()
  })

  it('colours a badge by what it means', () => {
    render(<Badge variant="warning">10 pcs still to buy</Badge>)
    expect(screen.getByText('10 pcs still to buy').className).toMatch(/text-warning/)
  })

  it('gives a card a real heading', () => {
    render(<Card><CardHeader><CardTitle>Shopping list</CardTitle></CardHeader></Card>)
    expect(screen.getByRole('heading', { name: 'Shopping list' })).toBeInTheDocument()
  })
})
