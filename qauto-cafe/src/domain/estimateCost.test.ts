import { describe, it, expect } from 'vitest'
import { estimateCost, priceFor, requestedAmount } from './estimateCost'
import { PRICE_LIST } from './priceList'
import type { PriceListItem } from '../db/schema'

const cost = (line: string) => estimateCost(line, PRICE_LIST)
const row = (id: string) => PRICE_LIST.find(p => p.id === id)!

describe('the price sheet itself', () => {
  it('has a unique id and at least one name to match on for every row', () => {
    expect(new Set(PRICE_LIST.map(p => p.id)).size).toBe(PRICE_LIST.length)
    for (const item of PRICE_LIST) {
      expect(item.match.length).toBeGreaterThan(0)
      expect(item.priceQar).toBeGreaterThan(0)
      expect(item.packQty).toBeGreaterThan(0)
    }
  })

  it("holds the sheet's figures, packs kept whole rather than reduced to a rate", () => {
    expect(row('coffee-beans')).toMatchObject({ priceQar: 90, packQty: 1, packUom: 'kg' })
    expect(row('matcha-syrup')).toMatchObject({ priceQar: 80, packQty: 450, packUom: 'grams' })
    expect(row('chocolate-sauce')).toMatchObject({ priceQar: 95, packQty: 2.5, packUom: 'kg' })
    expect(row('monin-strawberry')).toMatchObject({ priceQar: 38, packQty: 700, packUom: 'mL' })
    expect(row('sparkling-water')).toMatchObject({ priceQar: 3, packQty: 250, packUom: 'mL' })
  })

  it('every unit of measure on the sheet is one the estimator understands', () => {
    for (const item of PRICE_LIST) expect(cost(`${item.match[0]} 1`)).not.toBeUndefined()
  })
})

describe('requestedAmount', () => {
  it('reads a quantity written after the item', () => {
    expect(requestedAmount('Fresh Milk 4 ltrs', 'Fresh Milk')).toEqual({ qty: 4, uom: 'ltrs' })
    expect(requestedAmount('Fresh Orange 30pcs', 'Fresh Orange')).toEqual({ qty: 30, uom: 'pcs' })
  })

  it('reads a quantity written before the item', () => {
    expect(requestedAmount('12 bottles of sparkling water', 'sparkling water')).toEqual({ qty: 12, uom: 'bottles' })
  })

  it('reads a bare number with no unit', () => {
    expect(requestedAmount('Lemon 10', 'Lemon')).toEqual({ qty: 10 })
  })

  // "7 Up" and "14oz Cup" carry a number that is part of the name.
  it('does not mistake a number in the item name for a quantity', () => {
    expect(requestedAmount('7 Up 6 pcs', '7 Up')).toEqual({ qty: 6, uom: 'pcs' })
    expect(requestedAmount('Plastic Cups 16Oz 200', 'Plastic Cups 16Oz')).toEqual({ qty: 200 })
  })

  it('has nothing to report when no quantity was written', () => {
    expect(requestedAmount('Fresh Milk', 'Fresh Milk')).toBeUndefined()
    expect(requestedAmount('Fresh Milk 0', 'Fresh Milk')).toBeUndefined()
  })
})

describe('priceFor', () => {
  it("matches the inventory spelling as well as the sheet's", () => {
    expect(priceFor('Fresh Orange 30pcs', PRICE_LIST)?.item.id).toBe('orange')
    expect(priceFor('Orange 30pcs', PRICE_LIST)?.item.id).toBe('orange')
    expect(priceFor('Hersheys Chocolate Syrup 1', PRICE_LIST)?.item.id).toBe('hershey-chocolate-syrup')
  })

  it('prefers the longest name so a specific item beats a general one', () => {
    expect(priceFor('Monin Wild Mint Syrup 2', PRICE_LIST)?.item.id).toBe('monin-wild-mint')
    expect(priceFor('Mint Leaves 2 Bundles', PRICE_LIST)?.item.id).toBe('mint-leaves')
  })

  it('finds nothing for an item the sheet does not price', () => {
    expect(priceFor('Vanilla pods 3', PRICE_LIST)).toBeUndefined()
  })
})

// The real request that was live when this was built.
describe('costing the live request', () => {
  it('prices milk by the litre', () => {
    expect(cost('Fresh Milk 4 ltrs')).toBe(30)      // 4 x QAR 7.50
    expect(cost('Fresh Milk 6ltrs')).toBe(45)
  })

  it('prices counted items one by one', () => {
    expect(cost('Fresh Orange 30pcs')).toBe(69.6)   // 30 x QAR 2.32
    expect(cost('Lemon 10pcs')).toBe(10.2)          // 10 x QAR 1.02
  })

  it('prices a bundle of mint', () => {
    expect(cost('Mint Leaves 2 Bundles')).toBe(6)   // 2 x QAR 3.00
  })

  it("prices lactose free milk off the sheet's long-life carton", () => {
    expect(cost('Lactose Free Milk 4 ltrs')).toBe(30)
  })

  // A bottle of sparkling water is not 250 mL just because the price is; the
  // sheet does not say how big a bottle is, so neither does the estimate.
  it('says nothing when the unit asked for cannot be squared with the pack', () => {
    expect(cost('12 bottles of sparkling water')).toBeUndefined()
  })
})

describe('estimateCost', () => {
  it('scales a part of a pack', () => {
    expect(cost('Monin Strawberry Syrup 700ml')).toBe(38)
    expect(cost('Monin Strawberry Syrup 1400ml')).toBe(76)
    expect(cost('Monin Strawberry Syrup 350ml')).toBe(19)
  })

  it('converts between litres and millilitres, and kilos and grams', () => {
    expect(cost('Monin Strawberry Syrup 1.4 litres')).toBe(76)
    expect(cost('Coffee Beans 500g')).toBe(45)      // half of QAR 90 a kg
    expect(cost('Chocolate Sauce 2.5kg')).toBe(95)
    expect(cost('Chocolate Sauce 2500 g')).toBe(95)
  })

  it("takes a bare number as the pack's own unit", () => {
    expect(cost('Lemon 10')).toBe(10.2)
    expect(cost('Coffee Beans 2')).toBe(180)        // two kilos
  })

  it('rounds to the fils', () => {
    expect(cost('Hershey Chocolate Syrup 100 g')).toBe(2.69) // 100/650 x 17.50
  })

  it('gives no figure rather than a wrong one', () => {
    expect(cost('Fresh Milk')).toBeUndefined()          // no quantity
    expect(cost('Vanilla pods 3')).toBeUndefined()      // not on the sheet
    expect(cost('Coffee Beans 3 bottles')).toBeUndefined() // count against a weight
    expect(cost('Lemon 4 kg')).toBeUndefined()         // weight against a count
    expect(cost('')).toBeUndefined()
  })

  it('ignores a row with a nonsense pack size rather than dividing by zero', () => {
    const broken: PriceListItem[] = [{ id: 'x', name: 'X', priceQar: 10, packQty: 0, packUom: 'each', match: ['Widget'] }]
    expect(estimateCost('Widget 5', broken)).toBeUndefined()
  })

  it('has nothing to say when the sheet is empty', () => {
    expect(estimateCost('Fresh Milk 4 ltrs', [])).toBeUndefined()
  })
})
