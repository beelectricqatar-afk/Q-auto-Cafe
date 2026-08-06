import type { Staff } from '../db/schema'

const digits = (s: string) => s.replace(/\D/g, '')

export function matchStaff(query: string, staff: Staff[], limit = 8): Staff[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const qd = digits(q)
  return staff.filter(s => {
    if (!s.active) return false
    const byName = s.name.toLowerCase().includes(q)
    const byExt = qd.length > 0 && digits(s.extension).includes(qd)
    return byName || byExt
  }).slice(0, limit)
}

// ── Type-ahead inside a free-text box ───────────────────────────────────────
// Completes the word under the caret rather than the whole field, so a
// suggestion can be taken mid-sentence and typing carries on.

const WORD_BREAK = /[\s,;]/

/** The partial word ending at `caret`, and where in `text` it starts. */
export function wordAt(text: string, caret: number): { word: string; start: number } {
  const before = text.slice(0, caret)
  let start = before.length
  while (start > 0 && !WORD_BREAK.test(before[start - 1])) start--
  return { word: before.slice(start), start }
}

/**
 * Names containing `query`, case-insensitively. Prefix matches lead, and
 * repeats collapse — an inventory with the same item entered twice should not
 * offer it twice.
 */
export function matchNames(query: string, names: string[], limit = 6): string[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []
  const seen = new Set<string>()
  const hits: string[] = []
  for (const name of names) {
    const key = name.trim().toLowerCase()
    if (!key || seen.has(key) || !key.includes(q)) continue
    seen.add(key)
    hits.push(name.trim())
  }
  return hits
    .sort((a, b) => Number(!a.toLowerCase().startsWith(q)) - Number(!b.toLowerCase().startsWith(q)) || a.localeCompare(b))
    .slice(0, limit)
}

/**
 * Swaps the word under the caret for `replacement`, adding a trailing space so
 * the next word can be typed straight away — but not when punctuation or a
 * space already follows, which would leave "Orange , 5kg".
 */
export function replaceWordAt(text: string, caret: number, replacement: string): { text: string; caret: number } {
  const { start } = wordAt(text, caret)
  const after = text.slice(caret)
  const insert = after === '' || !/^[\s,;.]/.test(after) ? `${replacement} ` : replacement
  return { text: text.slice(0, start) + insert + after, caret: start + insert.length }
}
