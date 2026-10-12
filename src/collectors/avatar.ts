// Custom avatars: a single PNG (one picture for every state) or a sprite
// sheet (frames across, one row per state: idle, thinking, tool, done), cut
// into frames and fitted to Clawd's 24×28 pixel canvas. Pure: the engine reads
// the file and decodes it; this cuts and fits. Only paths are stored.

import type { AvatarState, SpriteFrames } from '../../types'
import type { Pixels } from '../render/raster/cells'
import { SPRITE_H, SPRITE_W, STATES } from '../render/raster/sprite'

/** `~/x` with the home folder; anything else as given. */
export function expandPath(path: string, home: string | undefined): string {
  const p = path.trim()
  if (home && (p === '~' || p.startsWith('~/'))) return home + p.slice(1)
  return p
}

/** Nearest-neighbour scaling down so the picture fits `w` by `h`; never scales up. */
export function fit(px: Pixels, w = SPRITE_W, h = SPRITE_H): Pixels {
  const ph = px.length
  const pw = px.reduce((n, r) => Math.max(n, r.length), 0)
  if (pw <= w && ph <= h) return px
  const s = Math.min(w / pw, h / ph)
  const ow = Math.max(1, Math.floor(pw * s))
  const oh = Math.max(1, Math.floor(ph * s))
  return Array.from({ length: oh }, (_, y) => Array.from({ length: ow }, (_, x) => px[Math.floor(y / s)]?.[Math.floor(x / s)] ?? null))
}

function isBlank(px: Pixels): boolean {
  return px.every(r => r.every(c => c === null))
}

function crop(px: Pixels, x: number, y: number, w: number, h: number): Pixels {
  return Array.from({ length: h }, (_, j) => Array.from({ length: w }, (_, i) => px[y + j]?.[x + i] ?? null))
}

/** The frame size of a sheet `framesPerRow` frames across: its width over the count, and Clawd's 24:28 proportion. */
export function frameSize(width: number, height: number, framesPerRow: number): { w: number; h: number; rows: number } {
  const w = Math.max(1, Math.floor(width / Math.max(1, framesPerRow)))
  const h = Math.max(1, Math.min(height, Math.round((w * SPRITE_H) / SPRITE_W)))
  return { w, h, rows: Math.max(1, Math.floor(height / h)) }
}

/** Cuts a sheet into frames per state; a sheet with fewer rows than states repeats its last row; blank frames end a row. */
export function sliceSheet(px: Pixels, framesPerRow: number): Record<AvatarState, Pixels[]> {
  const width = px.reduce((n, r) => Math.max(n, r.length), 0)
  const { w, h, rows } = frameSize(width, px.length, framesPerRow)
  const byRow: Pixels[][] = []
  for (let r = 0; r < rows; r++) {
    const frames: Pixels[] = []
    for (let c = 0; c < Math.max(1, framesPerRow); c++) {
      const f = crop(px, c * w, r * h, w, h)
      if (isBlank(f)) break
      frames.push(fit(f))
    }
    byRow.push(frames.length > 0 ? frames : [fit(crop(px, 0, r * h, w, h))])
  }
  const out = {} as Record<AvatarState, Pixels[]>
  STATES.forEach((s, i) => {
    out[s] = byRow[Math.min(i, byRow.length - 1)] ?? []
  })
  return out
}

/** One picture for every state. */
export function single(px: Pixels): Record<AvatarState, Pixels[]> {
  const f = fit(px)
  return { idle: [f], thinking: [f], tool: [f], done: [f] }
}

export function framesOf(source: string, frames: Record<AvatarState, Pixels[]>): SpriteFrames {
  const first = frames.idle[0] ?? []
  return { source, width: first.reduce((n, r) => Math.max(n, r.length), 0), height: first.length, frames }
}

/** The file name of a path, for the source line. */
export function baseName(path: string): string {
  return path.split('/').pop() || path
}

/** Half size, each 2×2 block to its most common color: the mockup's `mini()` for any picture. */
export function halve(px: Pixels): Pixels {
  const out: Pixels = []
  for (let j = 0; j < px.length; j += 2) {
    const row: (string | null)[] = []
    const w = px.reduce((n, r) => Math.max(n, r.length), 0)
    for (let i = 0; i < w; i += 2) {
      const cs = [px[j]?.[i], px[j]?.[i + 1], px[j + 1]?.[i], px[j + 1]?.[i + 1]].filter((c): c is string => typeof c === 'string')
      if (cs.length < 2) {
        row.push(null)
        continue
      }
      const count = new Map<string, number>()
      for (const c of cs) count.set(c, (count.get(c) ?? 0) + 1)
      const sorted = [...count.entries()].sort((a, z) => z[1] - a[1] || (a[0] < z[0] ? -1 : 1))
      // The darkest color among the ties keeps the eyes, as `mini()` lets them win.
      const darkest = cs.reduce((d, c) => (lum(c) < lum(d) ? c : d), cs[0] as string)
      row.push(lum(darkest) < 0.2 ? darkest : (sorted[0]?.[0] ?? null))
    }
    out.push(row)
  }
  return out
}

function lum(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

