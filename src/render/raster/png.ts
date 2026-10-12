// A small PNG decoder for custom sprites: the hooks environment has no image
// API and no DecompressionStream, so this inflates zlib data itself (RFC 1950
// and 1951, after zlib's `puff`) and undoes PNG's row filters. It reads
// non-interlaced PNGs of every color type at bit depths 1 to 16.

import type { Pixels } from './cells'

export class PngError extends Error {}

// ---------------------------------------------------------------------------
// Inflate

type Huffman = { count: Uint16Array; symbol: Uint16Array }

const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]

function huffman(lengths: ArrayLike<number>, n: number): Huffman {
  const count = new Uint16Array(16)
  const symbol = new Uint16Array(n)
  for (let s = 0; s < n; s++) count[lengths[s] ?? 0]! += 1
  const offs = new Uint16Array(16)
  for (let len = 1; len < 15; len++) offs[len + 1] = offs[len]! + count[len]!
  for (let s = 0; s < n; s++) {
    const len = lengths[s] ?? 0
    if (len !== 0) symbol[offs[len]!++] = s
  }
  return { count, symbol }
}

/** Inflates a zlib stream (two header bytes, deflate blocks, an Adler-32 checksum). */
export function inflate(data: Uint8Array, limit = 64 * 1024 * 1024): Uint8Array {
  let pos = 2
  let bitbuf = 0
  let bitcnt = 0
  const out: number[] = []
  const bits = (need: number): number => {
    let val = bitbuf
    while (bitcnt < need) {
      if (pos >= data.length) throw new PngError('the image data ends early')
      val |= data[pos++]! << bitcnt
      bitcnt += 8
    }
    bitbuf = val >>> need
    bitcnt -= need
    return val & ((1 << need) - 1)
  }
  const decode = (h: Huffman): number => {
    let code = 0
    let first = 0
    let index = 0
    for (let len = 1; len < 16; len++) {
      code |= bits(1)
      const count = h.count[len]!
      if (code - count < first) return h.symbol[index + (code - first)]!
      index += count
      first += count
      first <<= 1
      code <<= 1
    }
    throw new PngError('the image data is not valid deflate')
  }
  const codes = (lit: Huffman, dist: Huffman) => {
    for (;;) {
      const sym = decode(lit)
      if (sym < 256) out.push(sym)
      else if (sym === 256) return
      else {
        const li = sym - 257
        if (li >= 29) throw new PngError('the image data is not valid deflate')
        const len = LBASE[li]! + bits(LEXT[li]!)
        const ds = decode(dist)
        if (ds >= 30) throw new PngError('the image data is not valid deflate')
        const d = DBASE[ds]! + bits(DEXT[ds]!)
        if (d > out.length) throw new PngError('the image data is not valid deflate')
        for (let i = 0; i < len; i++) out.push(out[out.length - d]!)
      }
      if (out.length > limit) throw new PngError('the image is too large')
    }
  }
  const fixedLit = huffman(
    Array.from({ length: 288 }, (_, i) => (i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8)),
    288,
  )
  const fixedDist = huffman(Array(30).fill(5), 30)
  let last = 0
  while (last === 0) {
    last = bits(1)
    const type = bits(2)
    if (type === 0) {
      bitbuf = 0
      bitcnt = 0
      if (pos + 4 > data.length) throw new PngError('the image data ends early')
      const len = data[pos]! | (data[pos + 1]! << 8)
      pos += 4
      if (pos + len > data.length) throw new PngError('the image data ends early')
      for (let i = 0; i < len; i++) out.push(data[pos++]!)
    } else if (type === 1) {
      codes(fixedLit, fixedDist)
    } else if (type === 2) {
      const nlen = bits(5) + 257
      const ndist = bits(5) + 1
      const ncode = bits(4) + 4
      const lengths = new Uint8Array(320)
      for (let i = 0; i < ncode; i++) lengths[ORDER[i]!] = bits(3)
      const lencode = huffman(lengths, 19)
      const all = new Uint8Array(nlen + ndist)
      let i = 0
      while (i < nlen + ndist) {
        const sym = decode(lencode)
        if (sym < 16) all[i++] = sym
        else {
          let len = 0
          let rep: number
          if (sym === 16) {
            if (i === 0) throw new PngError('the image data is not valid deflate')
            len = all[i - 1]!
            rep = 3 + bits(2)
          } else if (sym === 17) rep = 3 + bits(3)
          else rep = 11 + bits(7)
          if (i + rep > nlen + ndist) throw new PngError('the image data is not valid deflate')
          while (rep--) all[i++] = len
        }
      }
      codes(huffman(all.subarray(0, nlen), nlen), huffman(all.subarray(nlen), ndist))
    } else {
      throw new PngError('the image data is not valid deflate')
    }
  }
  return Uint8Array.from(out)
}

// ---------------------------------------------------------------------------
// PNG

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]
const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

const u32 = (b: Uint8Array, at: number) => ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()

/** Decodes a PNG into pixels, `null` where alpha is under half. */
export function decodePng(bytes: Uint8Array, maxSide = 2048): Pixels {
  if (bytes.length < 8 || SIGNATURE.some((v, i) => bytes[i] !== v)) throw new PngError('the file is not a PNG')
  let at = 8
  let width = 0
  let height = 0
  let depth = 0
  let type = -1
  let interlace = 0
  let palette: number[][] = []
  let trns: Uint8Array | undefined
  const idat: Uint8Array[] = []
  while (at + 8 <= bytes.length) {
    const len = u32(bytes, at)
    const name = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!)
    const data = bytes.subarray(at + 8, at + 8 + len)
    at += 12 + len
    if (name === 'IHDR') {
      width = u32(data, 0)
      height = u32(data, 4)
      depth = data[8]!
      type = data[9]!
      interlace = data[12]!
    } else if (name === 'PLTE') {
      palette = []
      for (let i = 0; i + 2 < data.length; i += 3) palette.push([data[i]!, data[i + 1]!, data[i + 2]!])
    } else if (name === 'tRNS') {
      trns = data.slice()
    } else if (name === 'IDAT') {
      idat.push(data)
    } else if (name === 'IEND') {
      break
    }
  }
  const channels = CHANNELS[type]
  if (channels === undefined || width === 0 || height === 0) throw new PngError('the PNG header is not valid')
  if (interlace !== 0) throw new PngError('interlaced PNGs are not supported; save it without interlacing')
  if (width > maxSide || height > maxSide) throw new PngError(`the image is larger than ${maxSide}×${maxSide}`)
  const total = idat.reduce((n, c) => n + c.length, 0)
  const z = new Uint8Array(total)
  let o = 0
  for (const c of idat) {
    z.set(c, o)
    o += c.length
  }
  const stride = Math.ceil((width * channels * depth) / 8)
  const raw = inflate(z, (stride + 1) * height + 16)
  if (raw.length < (stride + 1) * height) throw new PngError('the image data ends early')
  const bpp = Math.max(1, (channels * depth) >> 3)
  const rows: Uint8Array[] = []
  let prev = new Uint8Array(stride)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!
    const line = raw.slice(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? line[x - bpp]! : 0
      const b = prev[x]!
      const c = x >= bpp ? prev[x - bpp]! : 0
      let add = 0
      if (filter === 1) add = a
      else if (filter === 2) add = b
      else if (filter === 3) add = (a + b) >> 1
      else if (filter === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a)
        const pb = Math.abs(pp - b)
        const pc = Math.abs(pp - c)
        add = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new PngError('the image uses an unknown row filter')
      line[x] = (line[x]! + add) & 255
    }
    rows.push(line)
    prev = line
  }
  const sample = (line: Uint8Array, i: number): number => {
    if (depth === 8) return line[i]!
    if (depth === 16) return line[i * 2]!
    const perByte = 8 / depth
    const byte = line[Math.floor(i / perByte)]!
    const shift = 8 - depth * ((i % perByte) + 1)
    return (byte >> shift) & ((1 << depth) - 1)
  }
  const scale = (v: number) => (depth >= 8 ? v : Math.round((v * 255) / ((1 << depth) - 1)))
  const out: Pixels = []
  for (const line of rows) {
    const row: (string | null)[] = []
    for (let x = 0; x < width; x++) {
      const base = x * channels
      let r = 0
      let g = 0
      let b = 0
      let alpha = 255
      if (type === 3) {
        const idx = sample(line, x)
        const c = palette[idx] ?? [0, 0, 0]
        ;[r, g, b] = [c[0]!, c[1]!, c[2]!]
        alpha = trns && idx < trns.length ? trns[idx]! : 255
      } else if (type === 0 || type === 4) {
        const v = sample(line, base)
        r = g = b = scale(v)
        if (type === 4) alpha = sample(line, base + 1)
        else if (trns && trns.length >= 2 && v === ((trns[0]! << 8) | trns[1]!) >> (depth === 16 ? 8 : 0)) alpha = 0
      } else {
        r = sample(line, base)
        g = sample(line, base + 1)
        b = sample(line, base + 2)
        if (type === 6) alpha = sample(line, base + 3)
        else if (trns && trns.length >= 6 && r === trns[depth === 16 ? 0 : 1] && g === trns[depth === 16 ? 2 : 3] && b === trns[depth === 16 ? 4 : 5]) alpha = 0
      }
      row.push(alpha < 128 ? null : hex(r, g, b))
    }
    out.push(row)
  }
  return out
}
