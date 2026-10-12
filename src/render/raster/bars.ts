// Bars: the usage meters (text, so every surface draws them) and the Context
// tab's stacked category bar (Raster cells on the terminal).

import type { Palette } from '../../theme'
import { bar, clip, len, pad } from '../ui'
import type { Span } from '../ui'
import type { Cell } from './cells'

export type Meter = {
  label: string
  frac: number | undefined
  color: string
  detail: string
  value: string
  isCritical?: boolean
}

/**
 * A meter row as the mockup's `meter()`: a 9-cell label, a bar of eighth
 * blocks, a detail and the value flush right. Critical paints the whole row
 * inverse red, the label upper case.
 */
export function meterSpans(m: Meter, w: number, pal: Palette, barCells = 24): Span[] {
  const crit = m.isCritical === true
  const bg = crit ? pal.R : undefined
  const labelText = (crit ? m.label.toUpperCase() : m.label).padEnd(9).slice(0, 9)
  const label: Span = crit ? { t: labelText, fg: pal.T, bg, b: true } : { t: labelText, fg: pal.D }
  const cells = Math.max(6, Math.min(barCells, w - 9 - 1 - 4 - 1))
  const track = crit ? pal.critTrack : pal.TR
  const barSpans = bar(m.frac ?? 0, cells, crit ? pal.T : m.color, track)
  const value: Span = { t: m.value, fg: crit ? pal.T : m.color, b: true, ...(bg ? { bg } : {}) }
  const room = w - 9 - cells - len(m.value) - 2
  const detail: Span[] = room > 0 ? clip([{ t: m.detail, fg: crit ? pal.T : pal.D, ...(crit ? { b: true, bg } : {}) }], room) : []
  const used = 9 + cells + 1 + detail.reduce((n, s) => n + len(s.t), 0)
  const gap = Math.max(1, w - used - len(m.value))
  const sp = (n: number): Span => (bg ? { t: ' '.repeat(Math.max(0, n)), bg } : pad(n))
  return [label, ...barSpans, sp(1), ...detail, sp(gap), value]
}

export type BarSegment = { tokens: number; color: string; pattern?: 'free' | 'buffer' }

/** The stacked category bar: `rows` rows of `w` cells, each category its share of the window. */
export function stackedCells(segments: readonly BarSegment[], window: number, w: number, rows: number, pal: Palette): Cell[][] {
  const row: Cell[] = []
  let used = 0
  segments.forEach((s, i) => {
    const isLast = i === segments.length - 1
    let n = window > 0 ? Math.round((s.tokens / window) * w) : 0
    if (s.tokens > 0 && n === 0) n = 1
    if (isLast) n = Math.max(n, w - used)
    n = Math.min(n, w - used)
    for (let j = 0; j < n; j++) {
      if (s.pattern === 'buffer') row.push({ ch: '░', fg: pal.D, bg: pal.TR })
      else if (s.pattern === 'free') row.push({ ch: ' ', bg: pal.TR })
      else row.push({ ch: '█', fg: s.color })
    }
    used += n
  })
  while (row.length < w) row.push({ ch: ' ', bg: pal.TR })
  return Array.from({ length: rows }, () => row.slice(0, w))
}
