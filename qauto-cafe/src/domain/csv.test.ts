import { describe, it, expect } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('builds header + rows', () => {
    const csv = toCsv([{ a: 1, b: 'x' }, { a: 2, b: 'y' }])
    expect(csv).toBe('a,b\r\n1,x\r\n2,y')
  })
  it('quotes values containing comma, quote, or newline', () => {
    const csv = toCsv([{ name: 'Doe, John', note: 'say "hi"' }])
    expect(csv).toBe('name,note\r\n"Doe, John","say ""hi"""')
  })
  it('returns empty string for empty input', () => { expect(toCsv([])).toBe('') })
})
