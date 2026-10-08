import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CrudList } from './CrudList'

interface Row { id: string; name: string; unit: string }
const rows: Row[] = [
  { id: '1', name: 'Lemon', unit: 'pcs' },
  { id: '2', name: 'Mint Leaves', unit: 'g' },
  { id: '3', name: 'Fresh Milk', unit: 'ml' },
]

const setup = (searchText?: (r: Row) => string) => render(
  <CrudList<Row>
    title="Inventory"
    rows={rows}
    fields={[{ name: 'name', label: 'Name' }]}
    rowLabel={r => <span>{r.name}</span>}
    empty={() => ({ name: '', unit: 'ml' })}
    onSave={vi.fn()}
    onDelete={vi.fn()}
    searchText={searchText}
  />,
)

describe('CrudList search', () => {
  it('has no search box unless searchText is supplied', () => {
    setup()
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
  })

  it('filters rows as you type and counts the matches', async () => {
    const user = userEvent.setup()
    setup(r => `${r.name} ${r.unit}`)
    expect(screen.getByText('Lemon')).toBeInTheDocument()

    await user.type(screen.getByPlaceholderText(/search/i), 'mint')
    expect(screen.getByText('Mint Leaves')).toBeInTheDocument()
    expect(screen.queryByText('Lemon')).not.toBeInTheDocument()
    expect(screen.getByText('Inventory (1 of 3)')).toBeInTheDocument()
  })

  it('matches case-insensitively and on any searchable field', async () => {
    const user = userEvent.setup()
    setup(r => `${r.name} ${r.unit}`)
    await user.type(screen.getByPlaceholderText(/search/i), 'PCS')
    expect(screen.getByText('Lemon')).toBeInTheDocument()
    expect(screen.queryByText('Fresh Milk')).not.toBeInTheDocument()
  })

  it('explains an empty result instead of claiming the list is empty', async () => {
    const user = userEvent.setup()
    setup(r => r.name)
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz')
    expect(screen.getByText('No matches for "zzz".')).toBeInTheDocument()
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument()
  })

  it('restores every row when the query is cleared', async () => {
    const user = userEvent.setup()
    setup(r => r.name)
    const box = screen.getByPlaceholderText(/search/i)
    await user.type(box, 'lemon')
    expect(screen.queryByText('Fresh Milk')).not.toBeInTheDocument()
    await user.clear(box)
    expect(screen.getByText('Fresh Milk')).toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument() // count drops off again
  })

  it('keeps the Add button reachable while filtering', async () => {
    const user = userEvent.setup()
    setup(r => r.name)
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz')
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })
})

describe('CrudList delete', () => {
  const show = (onDelete = vi.fn()) => {
    render(
      <CrudList<Row>
        title="Inventory"
        rows={rows}
        fields={[{ name: 'name', label: 'Name' }]}
        rowLabel={r => <span>{r.name}</span>}
        empty={() => ({ name: '', unit: 'ml' })}
        onSave={vi.fn()}
        onDelete={onDelete}
      />,
    )
    return onDelete
  }

  it('asks first, naming the row', async () => {
    const user = userEvent.setup()
    const onDelete = show()
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[2])
    expect(screen.getByRole('alertdialog', { name: 'Delete Fresh Milk?' })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledWith('3')
  })

  it('leaves the row alone on Cancel or Escape, with Cancel focused so Enter is safe', async () => {
    const user = userEvent.setup()
    const onDelete = show()
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
