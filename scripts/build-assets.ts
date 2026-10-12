// Renders the built-in Clawd sprites (ported from the mockup's `sprite()`)
// to PNG files in assets/, and writes test fixtures: the sheet, plus small
// PNGs in other color types and row filters for the decoder's tests.
// Run with Bun: `bun scripts/build-assets.ts`. Dev only; nothing here ships
// into the hooks module.

import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

import { FRAMES, sprite, SPRITE_H, SPRITE_W, STATES } from '../src/render/raster/sprite'
import type { Pixels } from '../src/render/raster/cells'
import { SPRITE } from '../src/theme'

const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
function crc32(bytes: Uint8Array): number {
  let c = -1
  for (const b of bytes) c = CRC[(c ^ b) & 255]! ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(width: number, height: number, depth: number, colorType: number, rows: Uint8Array[], extra: Buffer[] = [], filters: number[] = []): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = depth
  ihdr[9] = colorType
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]!
  const bpp = Math.max(1, (channels * depth) >> 3)
  const raw: number[] = []
  let prev = new Uint8Array(rows[0]!.length)
  rows.forEach((row, y) => {
    const f = filters[y % Math.max(1, filters.length)] ?? 0
    raw.push(f)
    for (let x = 0; x < row.length; x++) {
      const a = x >= bpp ? row[x - bpp]! : 0
      const b = prev[x]!
      const c = x >= bpp ? prev[x - bpp]! : 0
      let pred = 0
      if (f === 1) pred = a
      else if (f === 2) pred = b
      else if (f === 3) pred = (a + b) >> 1
      else if (f === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      raw.push((row[x]! - pred) & 255)
    }
    prev = row
  })
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', deflateSync(Buffer.from(raw))),
    chunk('IEND', new Uint8Array()),
  ])
}
function rgbaPng(px: Pixels, filters = [0]): Buffer {
  const h = px.length
  const w = Math.max(...px.map(r => r.length))
  const rows = px.map(r => {
    const out = new Uint8Array(w * 4)
    r.forEach((c, x) => {
      if (c === null) return
      out.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255], x * 4)
    })
    return out
  })
  return png(w, h, 8, 6, rows, [], filters)
}

const sheet: Pixels = Array.from({ length: SPRITE_H * STATES.length }, () => Array<string | null>(SPRITE_W * FRAMES).fill(null))
STATES.forEach((st, row) => {
  for (let f = 0; f < FRAMES; f++) {
    sprite(st, SPRITE, f).forEach((line, y) => line.forEach((c, x) => (sheet[row * SPRITE_H + y]![f * SPRITE_W + x] = c)))
  }
})
writeFileSync('assets/clawd-sheet.png', rgbaPng(sheet, [0, 1, 2, 3, 4]))
for (const st of STATES) writeFileSync(`assets/clawd-${st}.png`, rgbaPng(sprite(st, SPRITE, 0), [4]))

// Fixtures: a 4-bit palette image with transparency, and 8-bit RGB with a tRNS key.
const pal = [
  [0, 0, 0],
  [217, 119, 87],
  [28, 27, 26],
  [212, 160, 56],
]
const idx = [
  [0, 1, 1, 0, 3],
  [1, 2, 1, 2, 3],
  [1, 1, 1, 1, 0],
]
const packed = idx.map(r => {
  const out = new Uint8Array(Math.ceil(r.length / 2))
  r.forEach((v, x) => (out[x >> 1]! |= v << (x % 2 === 0 ? 4 : 0)))
  return out
})
const palette = png(5, 3, 4, 3, packed, [chunk('PLTE', Uint8Array.from(pal.flat())), chunk('tRNS', Uint8Array.from([0, 255, 255, 255]))], [0, 2, 4])
const rgbRows = [
  Uint8Array.from([255, 0, 0, 0, 255, 0, 1, 2, 3]),
  Uint8Array.from([0, 0, 255, 1, 2, 3, 255, 255, 255]),
]
const rgb = png(3, 2, 8, 2, rgbRows, [chunk('tRNS', Uint8Array.from([0, 1, 0, 2, 0, 3]))], [1, 3])
const b64 = (b: Buffer) => b.toString('base64')
writeFileSync(
  'tests/fixtures.ts',
  `// Written by scripts/build-assets.ts. PNG files as base64, for the decoder's tests.\n\n` +
    `/** assets/clawd-sheet.png: Clawd's 4 states × 4 frames, 24×28 each, filters 0-4 by row. */\n` +
    `export const SHEET_PNG = '${b64(readSheet())}'\n\n` +
    `/** 5×3, 4-bit palette with tRNS (index 0 transparent), filters None, Up, Paeth. */\n` +
    `export const PALETTE_PNG = '${b64(palette)}'\n\n` +
    `/** 3×2, 8-bit RGB with a tRNS key of #010203, filters Sub, Average. */\n` +
    `export const RGB_PNG = '${b64(rgb)}'\n`,
)
function readSheet(): Buffer {
  return rgbaPng(sheet, [0, 1, 2, 3, 4])
}
console.log('assets and tests/fixtures.ts written')
