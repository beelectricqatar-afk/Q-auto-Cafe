import type { PriceListItem } from '../db/schema'

/**
 * Units reduced to a dimension and a factor against that dimension's base.
 *
 * Every spelling a barista or the price sheet actually uses is listed, because
 * an unrecognised unit has to mean "no estimate" — quietly treating "ltrs" as
 * a count would price four litres of milk as four bottles.
 */
const UNITS: Record<string, { dim: 'volume' | 'mass' | 'count'; per: number }> = {
  ml: { dim: 'volume', per: 1 }, mls: { dim: 'volume', per: 1 }, millilitre: { dim: 'volume', per: 1 }, milliliter: { dim: 'volume', per: 1 },
  l: { dim: 'volume', per: 1000 }, ltr: { dim: 'volume', per: 1000 }, ltrs: { dim: 'volume', per: 1000 },
  litre: { dim: 'volume', per: 1000 }, litres: { dim: 'volume', per: 1000 },
  liter: { dim: 'volume', per: 1000 }, liters: { dim: 'volume', per: 1000 },

  g: { dim: 'mass', per: 1 }, gr: { dim: 'mass', per: 1 }, gram: { dim: 'mass', per: 1 }, grams: { dim: 'mass', per: 1 },
  kg: { dim: 'mass', per: 1000 }, kgs: { dim: 'mass', per: 1000 }, kilo: { dim: 'mass', per: 1000 }, kilos: { dim: 'mass', per: 1000 },

  // Counts are interchangeable: the sheet says "each" where a barista says
  // "pcs" or "bottles", and they mean the same thing — one of the item.
  each: { dim: 'count', per: 1 }, pc: { dim: 'count', per: 1 }, pcs: { dim: 'count', per: 1 },
  piece: { dim: 'count', per: 1 }, pieces: { dim: 'count', per: 1 },
  bottle: { dim: 'count', per: 1 }, bottles: { dim: 'count', per: 1 },
  bag: { dim: 'count', per: 1 }, bags: { dim: 'count', per: 1 },
  bundle: { dim: 'count', per: 1 }, bundles: { dim: 'count', per: 1 },
  box: { dim: 'count', per: 1 }, boxes: { dim: 'count', per: 1 },
  stick: { dim: 'count', per: 1 }, sticks: { dim: 'count', per: 1 },
  can: { dim: 'count', per: 1 }, cans: { dim: 'count', per: 1 },
  pack: { dim: 'count', per: 1 }, packs: { dim: 'count', per: 1 },
  cup: { dim: 'count', per: 1 }, cups: { dim: 'count', per: 1 },
}

const unit = (word: string) => UNITS[word.toLowerCase().replace(/[^a-z]/gi, '')]

export interface RequestedAmount {
  qty: number
  /** The unit as written, or undefined when only a bare number was given. */
  uom?: string
}

/**
 * The quantity asked for in a request line.
 *
 * Baristas write the number on either side of the unit — "Fresh Milk 4 ltrs"
 * but "12 bottles of sparkling water" — so both are read. A number that is part
 * of the item's name ("7 Up", "14oz Cup", "4 oz") is not a quantity, which is
 * why the matched name is cut out of the line before the search.
 */
export function requestedAmount(line: string, matchedName?: string): RequestedAmount | undefined {
  const rest = matchedName
    ? line.replace(new RegExp(matchedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')
    : line
  // A number, then a unit either straight after it or straight before it.
  const after = rest.match(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?/)
  if (!after) return undefined
  const qty = Number(after[1])
  if (!Number.isFinite(qty) || qty <= 0) return undefined
  if (after[2] && unit(after[2])) return { qty, uom: after[2] }

  const before = rest.match(/([a-zA-Z]+)\s+(\d+(?:\.\d+)?)\s*$/)
  if (before && unit(before[1])) return { qty: Number(before[2]), uom: before[1] }
  return { qty }
}

/** The price-sheet row a request line names, longest name first so that
 *  "Monin Wild Mint" beats "Mint Leaves" on a line that contains both. */
export function priceFor(line: string, prices: PriceListItem[]): { item: PriceListItem; matched: string } | undefined {
  const haystack = line.toLowerCase()
  let best: { item: PriceListItem; matched: string } | undefined
  for (const item of prices) {
    for (const name of item.match) {
      if (!haystack.includes(name.toLowerCase())) continue
      if (!best || name.length > best.matched.length) best = { item, matched: name }
    }
  }
  return best
}

/**
 * What a requested item should cost, from the supplier price sheet.
 *
 * Returns undefined rather than a guess whenever anything is unclear: no
 * matching item, no quantity, or a quantity whose unit cannot be reconciled
 * with the pack's ("12 bottles" against a price quoted per 250 mL says nothing
 * about how big those bottles are). The figure is only ever a starting point
 * for the admin, and a blank box is a better prompt than a wrong number.
 *
 * A bare number takes the pack's own unit, so "Lemon 10" costs ten lemons.
 */
export function estimateCost(line: string, prices: PriceListItem[]): number | undefined {
  const found = priceFor(line, prices)
  if (!found || found.item.packQty <= 0) return undefined

  const amount = requestedAmount(line, found.matched)
  if (!amount) return undefined

  const pack = unit(found.item.packUom)
  if (!pack) return undefined

  // No unit written means "this many of whatever it is sold in".
  const asked = amount.uom ? unit(amount.uom) : pack
  if (!asked || asked.dim !== pack.dim) return undefined

  const packSize = found.item.packQty * pack.per
  const wanted = amount.qty * asked.per
  return Math.round((wanted / packSize) * found.item.priceQar * 100) / 100
}
