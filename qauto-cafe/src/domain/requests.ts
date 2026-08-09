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
