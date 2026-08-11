import type { Branch } from '../db/schema'
import { branchFromText, branchLabel } from './branch'

/**
 * Splits a request message into the lines to show, one per row.
 *
 * Baristas type a request as a list, one item per line, often with a quantity
 * on the same line ("Fresh milk - 6 ltrs"). Rendering the raw string collapses
 * those newlines into spaces and runs every item together, so the lines are
 * split out here instead. Blank lines are dropped — messages routinely contain
 * runs of them, which would otherwise open large gaps — and runs of spaces
 * inside a line are collapsed so ragged typing still lines up.
 *
 * A quantity stays attached to its item because it is on the same line to
 * begin with; nothing is parsed out or rearranged.
 */
export function requestLines(message: string): string[] {
  return message
    .split(/\r?\n/)
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
}

export interface RequestItem {
  /** The line exactly as the barista wrote it, whitespace tidied. */
  text: string
  /** A section label ("Audi Cafe") rather than something to buy. */
  heading: boolean
  /** For an item, the branch of the heading it sits under, if that named one. */
  branch?: Branch
}

/**
 * Detects a section label rather than something to buy.
 *
 * Real requests are grouped under headings — "Audi Cafe", "Vw Cafe", "For Drink
 * Testing" — and those are not orderable things. Every heading seen so far has
 * no quantity, so a digit anywhere rules one out; on top of that the line has to
 * look like a label, which keeps a quantity-less item ("Sugar") an item. The
 * test is deliberately narrow: mistaking a heading for an item merely offers a
 * click that makes little sense, while the reverse hides a real item.
 */
function isHeading(line: string): boolean {
  if (/\d/.test(line)) return false
  return /\bcafe\b/i.test(line) || /^for\b/i.test(line) || /:$/.test(line) || !!branchFromText(line)
}

/**
 * The lines of a request, each tagged as a heading or an item, with items
 * carrying the branch of the heading above them.
 *
 * The branch comes from the heading because that is where it is written — the
 * item lines themselves are bare ("Fresh Milk 4 ltrs"), so reading each line in
 * isolation would lose which cafe asked for it.
 */
export function requestItems(message: string): RequestItem[] {
  let branch: Branch | undefined
  return requestLines(message).map(text => {
    if (isHeading(text)) {
      // A heading with no branch in it ("For Drink Testing") ends the previous
      // branch's run rather than letting it bleed into an unrelated section.
      branch = branchFromText(text)
      return { text, heading: true }
    }
    return { text, heading: false, ...(branch && { branch }) }
  })
}

/**
 * The description to put on an expense raised from a requested item.
 *
 * The line is carried over verbatim — it already reads as "quantity and name"
 * in the barista's own words, and re-parsing it into parts would only invent
 * ways to get "12 bottles of sparkling water" wrong. The branch is appended
 * because it lives on the heading and would otherwise be lost.
 */
export function expenseDescriptionFor(item: RequestItem): string {
  const branch = branchLabel(item.branch)
  return branch ? `${item.text} - ${branch}` : item.text
}
