// The cost-per-turn sparkline, as the mockup's `spark()`: one column per
// turn, `h` rows tall in eighth-block steps, the most expensive turn gold, the
// last emerald, the rest magenta.

import type { Palette } from '../../theme'
import type { Cell } from './cells'

export const SPK = [' ', '▁', '▂', '▃', '▄', '▅', '▆', '▇'] as const

export function sparkCells(vals: readonly number[], h: number, pal: Palette): Cell[][] {
  const rows: Cell[][] = Array.from({ length: h }, () => vals.map(() => ({ ch: ' ' }) as Cell))
  const mx = Math.max(...vals, 0)
  const mi = vals.indexOf(mx)
  vals.forEach((v, i) => {
    const lv = mx > 0 ? Math.max(1, Math.round((v / mx) * h * 8)) : 1
    const fg = i === mi && mx > 0 ? pal.G : i === vals.length - 1 ? pal.E : pal.M
    for (let r = 0; r < h; r++) {
      const n = Math.max(0, Math.min(8, lv - r * 8))
      const row = rows[h - 1 - r]
      if (n > 0 && row !== undefined) row[i] = { ch: n === 8 ? '█' : (SPK[n] ?? ' '), fg }
    }
  })
  return rows
}

/** One row of the sparkline, for the narrow layout and the band. */
export function sparkLine(vals: readonly number[], pal: Palette): Cell[] {
  const mx = Math.max(...vals, 0)
  return vals.map(v => ({ ch: SPK[mx > 0 ? Math.max(1, Math.round((v / mx) * 7)) : 1] ?? '▁', fg: v === mx && mx > 0 ? pal.G : pal.M }))
}
