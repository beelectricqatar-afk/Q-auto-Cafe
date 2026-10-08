import { describe, it, expect } from 'vitest'
import type { Request, RequestLine } from '../db/schema'
import { formatQty, receive, requestMessage, shoppingList } from './shoppingList'

const line = (over: Partial<RequestLine>): RequestLine => ({ id: Math.random().toString(36), branch: 'volkswagen', name: 'Orange', ingredientId: 'orange', unit: 'pcs', qty: 10, ...over })
const request = (id: string, timestamp: number, lines: RequestLine[], from = 'Patrick'): Request =>
  ({ id, timestamp, from, done: false, message: requestMessage(lines), lines })

const milkVw = line({ branch: 'volkswagen', ingredientId: 'milk', name: 'Fresh Milk', unit: 'ml', qty: 6000 })
const orangeVw = line({ branch: 'volkswagen', qty: 30 })
const orangeAudi = line({ branch: 'audi', qty: 15 })
const gloves = line({ branch: 'audi', ingredientId: undefined, name: 'Gloves', unit: undefined, unitLabel: 'boxes', qty: 2 })

describe('formatQty', () => {
  it('shows milk and sugar the way they are bought', () => {
    expect(formatQty(6000, 'ml')).toBe('6 L')
    expect(formatQty(500, 'ml')).toBe('500 ml')
    expect(formatQty(2500, 'g')).toBe('2.5 kg')
    expect(formatQty(30, 'pcs')).toBe('30 pcs')
    expect(formatQty(2, undefined, 'boxes')).toBe('2 boxes')
  })
})

describe('requestMessage', () => {
  it('writes the request out under cafe headings, VW first', () => {
    expect(requestMessage([orangeAudi, milkVw, orangeVw])).toBe('VW Cafe\nFresh Milk 6 L\nOrange 30 pcs\n\nAudi Cafe\nOrange 15 pcs')
  })
})

describe('shoppingList', () => {
  it('adds up the same item across cafes and requests, keeping the split', () => {
    const list = shoppingList([
      request('a', 1, [milkVw, orangeVw]),
      request('b', 2, [orangeAudi, gloves]),
    ])
    const orange = list.find(i => i.name === 'Orange')!
    expect(orange.byCafe).toEqual({ volkswagen: 30, audi: 15 })
    expect(orange.total).toBe(45)
    expect(list.map(i => i.name)).toEqual(['Fresh Milk', 'Orange', 'Gloves'])
  })

  it('leaves out what has already come in, and finished requests', () => {
    const list = shoppingList([
      request('a', 1, [{ ...orangeVw, received: 20 }]),
      { ...request('b', 2, [milkVw]), done: true },
    ])
    expect(list).toHaveLength(1)
    expect(list[0].total).toBe(10)
  })
})

describe('receive', () => {
  it('fills the oldest request first and finishes it', () => {
    const older = request('a', 1, [orangeVw], 'Patrick')
    const newer = request('b', 2, [orangeAudi], 'Sara')
    const { updated, notes } = receive([newer, older], new Map([['id:orange', 35]]))
    const a = updated.find(r => r.id === 'a')!, b = updated.find(r => r.id === 'b')!
    expect(a.done).toBe(true)
    expect(a.lines![0].received).toBe(30)
    expect(b.done).toBe(false)
    expect(b.lines![0].received).toBe(5)
    expect(notes).toEqual(["Patrick's request is fully received", "Sara's request stays open for Orange (10 pcs, Audi Cafe)"])
  })

  it('leaves a request alone when nothing it asked for was bought', () => {
    const { updated } = receive([request('a', 1, [milkVw])], new Map([['id:orange', 5]]))
    expect(updated).toEqual([])
  })

  it('matches things that are not stock items by name', () => {
    const { updated } = receive([request('a', 1, [gloves])], new Map([['name:gloves', 2]]))
    expect(updated[0].done).toBe(true)
  })
})
