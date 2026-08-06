import { describe, it, expect } from 'vitest'
import { matchNames, matchStaff, replaceWordAt, wordAt } from './search'
import type { Staff } from '../db/schema'

const staff: Staff[] = [
  { id: '1', name: 'Ahmed Shariefi', position: 'CEO', email: 'a@q.com', extension: '44452 (302)', departmentId: 'd1', active: true },
  { id: '2', name: 'Anu Vasu', position: 'Accountant', email: 'av@q.com', extension: '44452 (307)', departmentId: 'd2', active: true },
]

describe('matchStaff', () => {
  it('matches by extension digits, ignoring formatting', () => {
    expect(matchStaff('302', staff).map(s => s.id)).toEqual(['1'])
  })
  it('matches by name, case-insensitive substring', () => {
    expect(matchStaff('anu', staff).map(s => s.id)).toEqual(['2'])
  })
  it('returns [] for blank query', () => { expect(matchStaff('  ', staff)).toEqual([]) })
  it('excludes inactive staff', () => {
    const s2 = [{ ...staff[0], active: false }]
    expect(matchStaff('302', s2)).toEqual([])
  })
})

describe('wordAt', () => {
  it('reads the word being typed at the caret', () => {
    expect(wordAt('we need ora', 11)).toEqual({ word: 'ora', start: 8 })
  })
  it('ignores anything after the caret', () => {
    const text = 'we need ora, 5kg'
    expect(wordAt(text, 11)).toEqual({ word: 'ora', start: 8 })
  })
  it('starts a fresh word after a comma or newline', () => {
    expect(wordAt('milk, ora', 9).word).toBe('ora')
    expect(wordAt('milk\nora', 8).word).toBe('ora')
  })
  it('returns empty just after a separator', () => {
    expect(wordAt('we need ', 8)).toEqual({ word: '', start: 8 })
  })
})

describe('matchNames', () => {
  const inventory = ['Fresh Orange', 'Orange Juice', 'Lemon', 'Mint Leaves', 'Caramel Sauce', 'caramel sauce']

  it('finds names containing the fragment', () => {
    expect(matchNames('ora', inventory)).toEqual(['Orange Juice', 'Fresh Orange'])
  })
  it('puts prefix matches first', () => {
    expect(matchNames('ora', inventory)[0]).toBe('Orange Juice')
  })
  it('is case-insensitive', () => {
    expect(matchNames('LEM', inventory)).toEqual(['Lemon'])
  })
  it('collapses duplicate inventory entries', () => {
    expect(matchNames('caramel', inventory)).toEqual(['Caramel Sauce'])
  })
  it('stays quiet until there is enough to go on', () => {
    expect(matchNames('o', inventory)).toEqual([])
    expect(matchNames('', inventory)).toEqual([])
  })
  it('caps the number of suggestions', () => {
    expect(matchNames('item', Array.from({ length: 30 }, (_, i) => `Item ${i}`), 4)).toHaveLength(4)
  })
})

describe('replaceWordAt', () => {
  it('completes the partial word and leaves the caret after it', () => {
    expect(replaceWordAt('we need ora', 11, 'Fresh Orange'))
      .toEqual({ text: 'we need Fresh Orange ', caret: 21 })
  })
  it('keeps whatever follows the caret intact', () => {
    const { text, caret } = replaceWordAt('we need ora, 5kg', 11, 'Fresh Orange')
    expect(text).toBe('we need Fresh Orange, 5kg')
    expect(text.slice(caret)).toBe(', 5kg')
  })
  it('does not double up an existing space', () => {
    expect(replaceWordAt('ora more', 3, 'Orange').text).toBe('Orange more')
  })
})
