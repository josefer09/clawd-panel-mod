// Packing for `Raster`: a grid of cells, each a glyph and two colors, into the
// base64 of little-endian u32 triplets `[codePoint, fg, bg]` the element takes.
// Also the half-block mapping the mockup draws pixel art with: two pixels per
// cell, the top one in the foreground of `▀`, the bottom in its background.

import { DEFAULT_COLOR, rgb } from '../../theme'

export type Cell = { ch: string; fg?: string; bg?: string }

/** A picture: rows of `#RRGGBB` pixels, `null` for transparent. */
export type Pixels = (string | null)[][]

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Standard padded base64 of bytes (the environment's `toBase64` is not in this build's typings). */
export function base64(bytes: Uint8Array): string {
  let out = ''
  let i = 0
  for (; i + 2 < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!
  }
  const rest = bytes.length - i
  if (rest === 1) {
    const n = (bytes[i] ?? 0) << 16
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '=='
  } else if (rest === 2) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '='
  }
  return out
}

/** Bytes of standard base64. */
export function unbase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i] ?? 'A')
    const b = B64.indexOf(clean[i + 1] ?? 'A')
    const c = i + 2 < clean.length ? B64.indexOf(clean[i + 2] ?? 'A') : 0
    const d = i + 3 < clean.length ? B64.indexOf(clean[i + 3] ?? 'A') : 0
    const n = (a << 18) | (b << 12) | (c << 6) | d
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255
  }
  return out
}

const color = (hex: string | undefined): number => (hex === undefined ? DEFAULT_COLOR : rgb(hex))

/** The `cells` string of a Raster: rows of cells, each row `columns` wide (short rows padded). */
export function pack(rows: readonly (readonly Cell[])[], columns: number): string {
  const words = new Uint32Array(rows.length * columns * 3)
  rows.forEach((row, y) => {
    for (let x = 0; x < columns; x++) {
      const cell = row[x] ?? { ch: ' ' }
      const at = (y * columns + x) * 3
      words[at] = cell.ch.codePointAt(0) ?? 32
      words[at + 1] = color(cell.fg)
      words[at + 2] = color(cell.bg)
    }
  })
  return base64(new Uint8Array(words.buffer))
}

/** Two pixel rows per cell row, as the mockup's `px()`: `▀` with the top pixel as foreground, the bottom as background. */
export function halfBlocks(px: Pixels): Cell[][] {
  const width = px.reduce((w, row) => Math.max(w, row.length), 0)
  const out: Cell[][] = []
  for (let y = 0; y < px.length; y += 2) {
    const top = px[y] ?? []
    const bottom = px[y + 1] ?? []
    const row: Cell[] = []
    for (let x = 0; x < width; x++) {
      const t = top[x] ?? null
      const b = bottom[x] ?? null
      if (t === null && b === null) row.push({ ch: ' ' })
      else if (t === b) row.push({ ch: '█', fg: t as string })
      else if (t === null) row.push({ ch: '▄', fg: b as string })
      else if (b === null) row.push({ ch: '▀', fg: t })
      else row.push({ ch: '▀', fg: t, bg: b })
    }
    out.push(row)
  }
  return out
}

/** A blank picture of `w` by `h` pixels. */
export function blank(w: number, h: number): Pixels {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null))
}

/** Every pixel doubled: twice as wide and tall, as the mockup's `scale2()`. */
export function scale2(px: Pixels): Pixels {
  const out: Pixels = []
  for (const row of px) {
    const wide = row.flatMap(c => [c, c])
    out.push(wide, wide.slice())
  }
  return out
}

/** Text of cells, one string per row: what a surface without Raster draws. */
export function textRows(rows: readonly (readonly Cell[])[]): string[] {
  return rows.map(r => r.map(c => c.ch).join(''))
}
