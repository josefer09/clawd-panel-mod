// The five-axis radar of the Home tab, ported from the mockup's `radar()`:
// a pentagon of radius `r` pixels with rings at half and full, spokes, the
// value polygon filled and outlined, its points lit, and a label at each
// vertex, drawn into one canvas.

import type { Palette } from '../../theme'
import { blank } from './cells'
import type { Pixels } from './cells'
import { Canvas } from './canvas'

export type Axis = { label: string; value: string; frac: number; alert?: boolean }

/** The pentagon as pixels: `vals` are 0 to 1 along each axis, from the top clockwise. */
export function radarPixels(r: number, vals: readonly number[], pal: Palette): { px: Pixels; w: number; h: number; vertex: (k: number) => [number, number] } {
  const w = 2 * r + 1
  const cx = r
  const cy = r
  let h = Math.ceil(cy + r * Math.cos(Math.PI / 5)) + 1
  h += h % 2
  const g = blank(w, h)
  const set = (i: number, j: number, c: string) => {
    const row = g[j]
    if (row !== undefined && i >= 0 && i < w) row[i] = c
  }
  const ang = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / 5
  const pt = (k: number, f: number): [number, number] => [cx + Math.cos(ang(k)) * r * f, cy + Math.sin(ang(k)) * r * f]
  const line = (p: [number, number], q: [number, number], c: string) => {
    let x0 = Math.round(p[0])
    let y0 = Math.round(p[1])
    const x1 = Math.round(q[0])
    const y1 = Math.round(q[1])
    const dx = Math.abs(x1 - x0)
    const dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (let n = 0; n < 200; n++) {
      set(x0, y0, c)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) {
        err += dy
        x0 += sx
      }
      if (e2 <= dx) {
        err += dx
        y0 += sy
      }
    }
  }
  for (let k = 0; k < 5; k++) {
    line(pt(k, 0.5), pt(k + 1, 0.5), pal.radarGrid)
    line(pt(k, 1), pt(k + 1, 1), pal.LN)
    line([cx, cy], pt(k, 1), pal.radarGrid)
  }
  const poly = vals.map((v, k) => pt(k, Math.max(0.08, Math.min(1, v))))
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let inside = false
      for (let a = 0, b = 4; a < 5; b = a++) {
        const [xa, ya] = poly[a] ?? [0, 0]
        const [xb, yb] = poly[b] ?? [0, 0]
        if (ya > j !== yb > j && i < ((xb - xa) * (j - ya)) / (yb - ya) + xa) inside = !inside
      }
      const row = g[j]
      if (inside && row !== undefined) row[i] = row[i] ? pal.radarFillOver : pal.radarFill
    }
  }
  for (let k = 0; k < 5; k++) line(poly[k] ?? [cx, cy], poly[(k + 1) % 5] ?? [cx, cy], pal.radarEdge)
  for (const p of poly) set(Math.round(p[0]), Math.round(p[1]), pal.radarPoint)
  const vertex = (k: number): [number, number] => {
    const p = pt(k, 1)
    return [Math.round(p[0]), Math.floor(p[1] / 2)]
  }
  return { px: g, w, h, vertex }
}

/**
 * The radar with its labels, in a canvas `width` cells wide: the top axis's
 * label above, the side axes' beside their vertices, the bottom two below.
 * `x` is the radar's left column in the canvas.
 */
export function radarCanvas(axes: readonly Axis[], r: number, x: number, width: number, pal: Palette): Canvas {
  const { px, w, h, vertex } = radarPixels(r, axes.map(a => a.frac), pal)
  const rows = h / 2
  const c = new Canvas(width, rows + 2)
  const y = 1
  c.img(x, y, px)
  const A = (k: number): Axis => axes[k] ?? { label: '', value: '—', frac: 0 }
  const valueColor = (a: Axis) => (a.alert ? pal.T : pal.T)
  const top = A(0)
  const topText = `${top.label} ${top.value}`
  const tx = x + Math.floor((w - topText.length) / 2)
  c.put(tx, 0, top.label + ' ', pal.D)
  c.put(tx + top.label.length + 1, 0, top.value, top.alert ? pal.T : valueColor(top), top.alert ? pal.R : undefined)
  const [, r1y] = vertex(1)
  c.put(x + w + 1, y + r1y, A(1).label, pal.D)
  c.put(x + w + 1, y + r1y + 1, A(1).value, pal.T)
  const [, r4y] = vertex(4)
  c.right(x - 1, y + r4y, A(4).label, pal.D)
  c.right(x - 1, y + r4y + 1, A(4).value, pal.T)
  const [v2x] = vertex(2)
  const n2 = c.put(x + v2x, y + rows, A(2).label + ' ', pal.D)
  c.put(n2, y + rows, A(2).value, pal.T)
  const [v3x] = vertex(3)
  const left = `${A(3).label} ${A(3).value}`
  const lx = x + v3x + 1 - left.length
  const n3 = c.put(lx, y + rows, A(3).label + ' ', pal.D)
  c.put(n3, y + rows, A(3).value, pal.T)
  return c
}

/** The radar as an SVG document, for a surface with no Raster (the desktop app). */
export function radarSvg(axes: readonly Axis[], pal: Palette, size = 180): string {
  const r = size * 0.32
  const cx = size / 2
  const cy = size / 2 + 4
  const ang = (k: number) => -Math.PI / 2 + (k * 2 * Math.PI) / 5
  const pt = (k: number, f: number) => [cx + Math.cos(ang(k)) * r * f, cy + Math.sin(ang(k)) * r * f]
  const ring = (f: number) =>
    Array.from({ length: 5 }, (_, k) => pt(k, f))
      .map(p => `${(p[0] ?? 0).toFixed(1)},${(p[1] ?? 0).toFixed(1)}`)
      .join(' ')
  const poly = axes
    .map((a, k) => pt(k, Math.max(0.08, Math.min(1, a.frac))))
    .map(p => `${(p[0] ?? 0).toFixed(1)},${(p[1] ?? 0).toFixed(1)}`)
    .join(' ')
  const spokes = Array.from({ length: 5 }, (_, k) => {
    const p = pt(k, 1)
    return `<line x1="${cx}" y1="${cy}" x2="${(p[0] ?? 0).toFixed(1)}" y2="${(p[1] ?? 0).toFixed(1)}" stroke="${pal.radarGrid}"/>`
  }).join('')
  const labels = axes
    .map((a, k) => {
      const p = pt(k, 1.32)
      const anchor = k === 0 ? 'middle' : k === 1 || k === 2 ? 'start' : 'end'
      const fill = a.alert ? pal.R : pal.T
      return `<text x="${(p[0] ?? 0).toFixed(1)}" y="${(p[1] ?? 0).toFixed(1)}" text-anchor="${anchor}" font-family="monospace" font-size="11"><tspan fill="${pal.D}">${esc(a.label)} </tspan><tspan fill="${fill}" font-weight="bold">${esc(a.value)}</tspan></text>`
    })
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">` +
    `<polygon points="${ring(0.5)}" fill="none" stroke="${pal.radarGrid}"/>` +
    `<polygon points="${ring(1)}" fill="none" stroke="${pal.LN}"/>` +
    spokes +
    `<polygon points="${poly}" fill="${pal.radarFill}" stroke="${pal.radarEdge}"/>` +
    labels +
    `</svg>`
  )
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
