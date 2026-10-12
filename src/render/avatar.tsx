// Draws a sprite picture on the surface at hand: an `Image` (kitty graphics)
// where the terminal shows pixels and the mode asks for it, a `Raster` of
// half-block cells elsewhere on the terminal, an `Svg` on the other surfaces.

import type { ImageSource, RenderElement } from 'claude-code'

import { base64, halfBlocks, pack } from './raster/cells'
import type { Pixels } from './raster/cells'
import type { Ctx } from './ui'
import { Line } from './ui'

export type Drawn = 'image' | 'cells'

/** How many pixels across each sprite pixel becomes in an Image, so the terminal's scaling stays crisp. */
export const IMAGE_SCALE = 4

/** A picture as RGBA bytes, every pixel `scale` times, transparent where the picture is. */
export function rgbaOf(px: Pixels, scale = IMAGE_SCALE): { rgba: string; width: number; height: number } {
  const h = px.length
  const w = px.reduce((n, r) => Math.max(n, r.length), 0)
  const W = w * scale
  const H = h * scale
  const bytes = new Uint8Array(W * H * 4)
  for (let y = 0; y < H; y++) {
    const row = px[Math.floor(y / scale)] ?? []
    for (let x = 0; x < W; x++) {
      const c = row[Math.floor(x / scale)] ?? null
      if (c === null) continue
      const at = (y * W + x) * 4
      bytes[at] = parseInt(c.slice(1, 3), 16)
      bytes[at + 1] = parseInt(c.slice(3, 5), 16)
      bytes[at + 2] = parseInt(c.slice(5, 7), 16)
      bytes[at + 3] = 255
    }
  }
  return { rgba: base64(bytes), width: W, height: H }
}

export function imageSourceOf(px: Pixels): ImageSource {
  return rgbaOf(px)
}

/** Cells as a Raster expects them. */
export function rasterCells(px: Pixels): { cells: string; columns: number; rows: number } {
  const rows = halfBlocks(px)
  const columns = px.reduce((n, r) => Math.max(n, r.length), 0)
  return { cells: pack(rows, columns), columns, rows: rows.length }
}

function svgOf(px: Pixels, alt: string): string {
  const h = px.length
  const w = px.reduce((n, r) => Math.max(n, r.length), 0)
  const rects: string[] = []
  px.forEach((row, y) =>
    row.forEach((c, x) => {
      if (c !== null) rects.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`)
    }),
  )
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges"><title>${alt}</title>${rects.join('')}</svg>`
}

/**
 * The picture as an element keyed `key` (what `$.ui.blit` names to animate it).
 * `image` draws `source` (or the pixels) as an Image; `cells` as a Raster.
 */
export function picture(ctx: Ctx, key: string, px: Pixels, drawn: Drawn, alt: string, source?: ImageSource): RenderElement {
  const { Raster, Image, Svg } = ctx.extra
  const w = px.reduce((n, r) => Math.max(n, r.length), 0)
  const rows = Math.ceil(px.length / 2)
  if (drawn === 'image' && Image) {
    return <Image key={key} source={source ?? imageSourceOf(px)} columns={w} rows={rows} alt={alt} />
  }
  if (Raster) {
    const r = rasterCells(px)
    return <Raster key={key} columns={r.columns} rows={r.rows} cells={r.cells} />
  }
  if (Svg) return <Svg source={svgOf(px, alt)} alt={alt} width={w * 6} height={px.length * 6} />
  return Line(ctx, [{ t: alt, fg: ctx.pal.D }], key)
}
