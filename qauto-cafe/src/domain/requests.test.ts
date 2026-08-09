import { describe, it, expect } from 'vitest'
import { requestLines } from './requests'

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
