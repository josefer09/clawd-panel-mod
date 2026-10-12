// A small cell buffer, as the mockup's `Buf`: write text and pixel art at cell
// coordinates, then hand the cells to one `Raster` (or read them as text where
// a surface has no Raster).

import { halfBlocks } from './cells'
import type { Cell, Pixels } from './cells'

export class Canvas {
  readonly cells: Cell[][]

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = Array.from({ length: height }, () => Array.from({ length: width }, () => ({ ch: ' ' }) as Cell))
  }

  /** Writes `text` from (x, y); off-canvas cells are dropped. Returns the column after it. */
  put(x: number, y: number, text: string, fg?: string, bg?: string): number {
    const chars = Array.from(text)
    const row = this.cells[y]
    chars.forEach((ch, i) => {
      const cx = x + i
      if (row === undefined || cx < 0 || cx >= this.width) return
      const cell: Cell = { ch }
      if (fg !== undefined) cell.fg = fg
      if (bg !== undefined) cell.bg = bg
      row[cx] = cell
    })
    return x + chars.length
  }

  /** Writes `text` so it ends at column `xr`. */
  right(xr: number, y: number, text: string, fg?: string): number {
    return this.put(xr - Array.from(text).length, y, text, fg)
  }

  /** Draws pixel art from (x, y), two pixel rows per cell row; transparent pixels leave the cell as it was. */
  img(x: number, y: number, px: Pixels): void {
    halfBlocks(px).forEach((row, j) => {
      row.forEach((cell, i) => {
        if (cell.ch === ' ' && cell.bg === undefined) return
        const target = this.cells[y + j]
        if (target !== undefined && x + i >= 0 && x + i < this.width) target[x + i] = cell
      })
    })
  }
}
