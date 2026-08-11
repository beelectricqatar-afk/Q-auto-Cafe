import { describe, it, expect } from 'vitest'
import { expenseDescriptionFor, requestItems, requestLines } from './requests'
import { branchFromText } from './branch'

// The real request that was live when this was built, verbatim.
const REAL = `Audi Cafe

Fresh Milk   4 ltrs

Fresh Orange   30pcs

Lemon   10pcs




Vw Cafe

Fresh Milk   6ltrs

Mint Leaves  2 Bundles


Lactose Free Milk   4 ltrs





For Drink Testing


12  bottles of sparkling water`

describe('requestLines', () => {
  it('puts each item on its own line instead of running them together', () => {
    // The exact message that rendered as "Fresh Orange Fresh Apple Mint Leaves".
    expect(requestLines('Fresh Orange \n\nFresh Apple \n\nMint Leaves'))
      .toEqual(['Fresh Orange', 'Fresh Apple', 'Mint Leaves'])
  })

  it('keeps a quantity on the same line as its item', () => {
    expect(requestLines('Fresh milk.   - 6 ltrs\nMint leaves -   1 bundle'))
      .toEqual(['Fresh milk. - 6 ltrs', 'Mint leaves - 1 bundle'])
  })

  it('drops runs of blank lines rather than leaving gaps', () => {
    expect(requestLines('Audi\nFresh Milk \n\n\n\nVw\n7up'))
      .toEqual(['Audi', 'Fresh Milk', 'Vw', '7up'])
  })

  it('handles a real multi-branch request', () => {
    const msg = 'Audi Cafe \n\nFresh milk.   - 6 ltrs\nMint leaves -   1 bundle\n\n\nVolkswagen Cafe \n\n\nFresh milk.      -6 ltrs\nMint leaves.      -1 bundle'
    expect(requestLines(msg)).toEqual([
      'Audi Cafe',
      'Fresh milk. - 6 ltrs',
      'Mint leaves - 1 bundle',
      'Volkswagen Cafe',
      'Fresh milk. -6 ltrs',
      'Mint leaves. -1 bundle',
    ])
  })

  it('treats a single-line message as one line', () => {
    expect(requestLines('We need more oranges, 5kg')).toEqual(['We need more oranges, 5kg'])
  })

  it('returns nothing for an empty or blank message', () => {
    expect(requestLines('')).toEqual([])
    expect(requestLines('   \n\n  \n')).toEqual([])
  })

  it('copes with carriage returns', () => {
    expect(requestLines('Milk\r\nSugar')).toEqual(['Milk', 'Sugar'])
  })
})

describe('branchFromText', () => {
  it('reads the branch a heading names, however it is spelled', () => {
    expect(branchFromText('Audi Cafe')).toBe('audi')
    expect(branchFromText('audi')).toBe('audi')
    expect(branchFromText('Vw Cafe')).toBe('volkswagen')
    expect(branchFromText('VOLKSWAGEN')).toBe('volkswagen')
  })

  it('does not find a branch inside a longer word', () => {
    expect(branchFromText('Audited stock')).toBeUndefined()
    expect(branchFromText('vwx')).toBeUndefined()
  })

  it('is undefined when no branch is named', () => {
    expect(branchFromText('For Drink Testing')).toBeUndefined()
    expect(branchFromText('Fresh Milk 4 ltrs')).toBeUndefined()
  })
})

describe('requestItems', () => {
  const items = requestItems(REAL)

  it('keeps every line, still in order', () => {
    expect(items.map(i => i.text)).toEqual(requestLines(REAL))
  })

  it('marks the section headings and nothing else', () => {
    expect(items.filter(i => i.heading).map(i => i.text)).toEqual(['Audi Cafe', 'Vw Cafe', 'For Drink Testing'])
  })

  it('tags each item with the branch of the heading above it', () => {
    const branchOf = (text: string) => items.find(i => i.text === text)?.branch
    expect(branchOf('Fresh Orange 30pcs')).toBe('audi')
    expect(branchOf('Lemon 10pcs')).toBe('audi')
    expect(branchOf('Mint Leaves 2 Bundles')).toBe('volkswagen')
    expect(branchOf('Lactose Free Milk 4 ltrs')).toBe('volkswagen')
  })

  // "Fresh Milk" is asked for by both cafes; the two lines must not be conflated.
  it('separates the same item requested under two headings', () => {
    const milk = items.filter(i => i.text.startsWith('Fresh Milk'))
    expect(milk).toHaveLength(2)
    expect(milk[0]).toMatchObject({ text: 'Fresh Milk 4 ltrs', branch: 'audi' })
    expect(milk[1]).toMatchObject({ text: 'Fresh Milk 6ltrs', branch: 'volkswagen' })
  })

  // Otherwise "Volkswagen" would be stamped on drink-testing supplies.
  it('does not carry a branch past a heading that names none', () => {
    expect(items.find(i => i.text === '12 bottles of sparkling water')?.branch).toBeUndefined()
  })

  it('treats an item with no quantity as an item, not a heading', () => {
    expect(requestItems('Audi Cafe\nSugar\nCups')).toEqual([
      { text: 'Audi Cafe', heading: true },
      { text: 'Sugar', heading: false, branch: 'audi' },
      { text: 'Cups', heading: false, branch: 'audi' },
    ])
  })

  it('reads a heading before any items, and a bare list with no headings', () => {
    expect(requestItems('Supplies:\nSugar 2kg')[0]).toEqual({ text: 'Supplies:', heading: true })
    expect(requestItems('Sugar 2kg')).toEqual([{ text: 'Sugar 2kg', heading: false }])
  })

  it('has nothing to show for an empty message', () => {
    expect(requestItems('')).toEqual([])
    expect(requestItems('\n\n  \n')).toEqual([])
  })
})

describe('expenseDescriptionFor', () => {
  it('keeps the quantity and name as written, and names the branch', () => {
    const [, milk] = requestItems(REAL)
    expect(expenseDescriptionFor(milk)).toBe('Fresh Milk 4 ltrs - Audi')
  })

  it('spells the branch out in full rather than as the barista typed it', () => {
    const mint = requestItems(REAL).find(i => i.text.startsWith('Mint Leaves'))!
    expect(expenseDescriptionFor(mint)).toBe('Mint Leaves 2 Bundles - Volkswagen')
  })

  it('leaves the branch off when the request never named one', () => {
    const water = requestItems(REAL).find(i => i.text.startsWith('12 bottles'))!
    expect(expenseDescriptionFor(water)).toBe('12 bottles of sparkling water')
  })
})
