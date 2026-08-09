import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AdminPanel } from './AdminPanel'
import type { Data } from '../../app/useData'
import type { Request } from '../../db/schema'

const listRequests = vi.fn()
vi.mock('../../sync/config', () => ({ isConfigured: () => true }))
vi.mock('../../sync/client', () => ({
  client: {
    listRequests: (...a: unknown[]) => listRequests(...a),
    saveRequest: vi.fn().mockResolvedValue(undefined),
    deleteRequest: vi.fn().mockResolvedValue(undefined),
    listBackups: vi.fn().mockResolvedValue([]),
  },
}))

const data: Data = { departments: [], staff: [], categories: [], menuItems: [], ingredients: [] }
const req = (id: string, done: boolean): Request => ({ id, timestamp: Date.UTC(2026, 7, 5), message: `Item ${id}`, from: 'Patrick', done })

const requestsTab = () => screen.getByRole('button', { name: /Requests/ })

beforeEach(() => {
  cleanup()
  listRequests.mockReset()
})

describe('the Requests tab badge', () => {
  it('shows how many requests are still open', async () => {
    listRequests.mockResolvedValue([req('a', false), req('b', false), req('c', true)])
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    // Only the two open ones are counted; the done one is not.
    await waitFor(() => expect(within(requestsTab()).getByText('2')).toBeInTheDocument())
  })

  it('shows nothing when every request is done', async () => {
    listRequests.mockResolvedValue([req('a', true), req('b', true)])
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(listRequests).toHaveBeenCalled())
    expect(within(requestsTab()).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('shows nothing when there are no requests at all', async () => {
    listRequests.mockResolvedValue([])
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(listRequests).toHaveBeenCalled())
    expect(within(requestsTab()).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })

  it('hides the badge once the sidebar is collapsed', async () => {
    listRequests.mockResolvedValue([req('a', false)])
    const user = userEvent.setup()
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(within(requestsTab()).getByText('1')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: /Collapse/ }))
    expect(within(requestsTab()).queryByText('1')).not.toBeInTheDocument()
  })

  it('carries an accessible label rather than a bare number', async () => {
    listRequests.mockResolvedValue([req('a', false)])
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(screen.getByLabelText('1 open request')).toBeInTheDocument())
  })

  it('does not break when requests cannot be fetched', async () => {
    listRequests.mockRejectedValue(new Error('offline'))
    render(<AdminPanel data={data} refresh={vi.fn().mockResolvedValue(undefined)} />)
    await waitFor(() => expect(listRequests).toHaveBeenCalled())
    expect(requestsTab()).toBeInTheDocument()
    expect(within(requestsTab()).queryByText(/^\d+$/)).not.toBeInTheDocument()
  })
})
