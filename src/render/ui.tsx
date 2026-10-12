// Render primitives shared by every tab. The mockup draws each board into a
// cell buffer with `put`, `seq` (left-aligned segments) and `rseq`
// (right-aligned ones); a `Line` here is the same idea as a `Text` of styled
// spans padded to the body's width, so the layout keeps to the cell grid.

import type {
  BoxProps,
  ButtonProps,
  ElementConstructor,
  ElementTable,
  ImageProps,
  InputProps,
  RasterProps,
  RenderElement,
  RenderSurface,
  SelectProps,
  SvgProps,
  TextProps,
} from 'claude-code'

import type { Palette } from '../theme'

/** The elements every surface has: what the shared helpers draw with. */
export type Els = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
}

/** The elements only some surfaces have; absent where the surface lacks them. */
export type Extras = {
  Raster?: ElementConstructor<RasterProps>
  Image?: ElementConstructor<ImageProps>
  Svg?: ElementConstructor<SvgProps>
  Input?: ElementConstructor<InputProps>
  Select?: ElementConstructor<SelectProps>
}

/**
 * Splits a surface's element table into the shared elements and the extras
 * that surface draws. A table is completed with every element name (one a
 * surface lacks draws an empty fragment), so the surface decides, not the
 * table: Raster and Image on the terminal, Svg elsewhere, Input and Select
 * everywhere but mobile.
 */
export function elementsOf(table: ElementTable, surface: RenderSurface): { el: Els; extra: Extras } {
  const t = table as unknown as Els & Required<Extras>
  const extra: Extras = {}
  if (surface === 'terminal') {
    extra.Raster = t.Raster
    extra.Image = t.Image
  } else {
    extra.Svg = t.Svg
  }
  if (surface !== 'mobile') {
    extra.Input = t.Input
    extra.Select = t.Select
  }
  return { el: { Box: t.Box, Text: t.Text, Button: t.Button }, extra }
}

export type Ctx = {
  el: Els
  extra: Extras
  /** The pane's request id, which `$.ui.blit` names. */
  site: string
  surface: RenderSurface
  /** Cells across the body. */
  width: number
  pal: Palette
  /** `$.clock.now()` as of the last tick, for "Ns ago" stamps. */
  now: number
}

/** One styled run of text. */
export type Span = {
  t: string
  fg?: string
  bg?: string
  b?: boolean
  i?: boolean
}

export const len = (s: string): number => Array.from(s).length

export const width = (spans: readonly Span[]): number => spans.reduce((n, s) => n + len(s.t), 0)

/** Cuts spans to `max` cells, ending with an ellipsis when it cut, as the mockup's `seq` does. */
export function clip(spans: readonly Span[], max: number): Span[] {
  if (max <= 0) return []
  if (width(spans) <= max) return [...spans]
  const out: Span[] = []
  let room = max
  for (const span of spans) {
    const chars = Array.from(span.t)
    if (chars.length < room) {
      out.push(span)
      room -= chars.length
      continue
    }
    out.push({ ...span, t: chars.slice(0, Math.max(0, room - 1)).join('') + '…' })
    break
  }
  return out
}

export const pad = (n: number): Span => ({ t: ' '.repeat(Math.max(0, n)) })

/** Left spans, then right spans flush against `w`, cutting the left to fit. */
export function spread(w: number, left: readonly Span[], right: readonly Span[] = []): Span[] {
  const rw = width(right)
  const lw = Math.min(width(left), Math.max(0, w - rw - (rw > 0 ? 1 : 0)))
  const l = clip(left, lw)
  return [...l, pad(w - width(l) - rw), ...right]
}

/** Text centered in `w` cells. */
export function center(w: number, spans: readonly Span[]): Span[] {
  const sw = Math.min(width(spans), w)
  const left = Math.floor((w - sw) / 2)
  return [pad(left), ...clip(spans, w)]
}

/** Draws spans as one row of text. */
export function Line(ctx: Ctx, spans: readonly Span[], key?: string): RenderElement {
  const { Text } = ctx.el
  const parts = spans.filter(s => s.t.length > 0)
  return (
    <Text key={key} wrap="truncate">
      {parts.length === 0
        ? ' '
        : parts.map(s => (
            <Text color={s.fg} backgroundColor={s.bg} bold={s.b} italic={s.i}>
              {s.t}
            </Text>
          ))}
    </Text>
  )
}

/** A full-width row of `ch` in a color: the pane's rules. */
export function rule(ctx: Ctx, ch = '─'): RenderElement {
  return Line(ctx, [{ t: ch.repeat(ctx.width), fg: ctx.pal.LN }])
}

/** A section title: red, bold, upper case, a rule to the right, and an optional note at the end. */
export function title(ctx: Ctx, w: number, text: string, note?: string, noteColor?: string): Span[] {
  const head: Span = { t: text.toUpperCase(), fg: ctx.pal.R, b: true }
  const tail: Span[] = note ? [{ t: ' ' + note, fg: noteColor ?? ctx.pal.D }] : []
  const fill = Math.max(0, w - len(head.t) - 1 - width(tail))
  return [head, { t: ' ' }, { t: '─'.repeat(fill), fg: ctx.pal.LN }, ...tail]
}

/** A sub-title: gold, bold, upper case, a dotted rule, and an optional note. */
export function subtitle(ctx: Ctx, w: number, text: string, note?: string): Span[] {
  const head: Span = { t: text.toUpperCase(), fg: ctx.pal.G, b: true }
  const tail: Span[] = note ? [{ t: ' ' + note, fg: ctx.pal.D }] : []
  const fill = Math.max(0, w - len(head.t) - 1 - width(tail))
  return [head, { t: ' ' }, { t: '┄'.repeat(fill), fg: ctx.pal.LN }, ...tail]
}

/** The status chips of the mockup's `CHIP` table, as spans. */
export function chip(ctx: Ctx, kind: string, text = kind): Span {
  const p = ctx.pal
  switch (kind) {
    case 'running':
      return { t: ` ${text} `, fg: p.BG, bg: p.E, b: true }
    case 'waiting':
    case 'pending':
    case 'idle':
      return { t: ` ${text} `, fg: p.BG, bg: p.G, b: true }
    case 'failed':
    case 'killed':
      return { t: ` ${text} `, fg: p.T, bg: p.R, b: true }
    case 'effort':
      return { t: ` ${text} `, fg: p.G, bg: p.TR, b: true }
    default:
      return { t: ` ${text} `, fg: p.D, bg: p.TR }
  }
}

/** Eighth-block partials, as the mockup's meters draw them. */
export const PART = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const

/** A horizontal bar of `cells` cells filled to `frac`, in eighth-block steps. */
export function bar(frac: number, cells: number, fg: string, track: string): Span[] {
  const eighths = Math.round(Math.max(0, Math.min(1, frac)) * cells * 8)
  const out: Span[] = []
  for (let i = 0; i < cells; i++) {
    const n = Math.max(0, Math.min(8, eighths - i * 8))
    out.push({ t: n === 8 ? '█' : n === 0 ? ' ' : (PART[n] ?? ' '), fg, bg: track })
  }
  return merge(out)
}

/** Joins neighbouring spans of one style, so a tree carries fewer elements. */
export function merge(spans: readonly Span[]): Span[] {
  const out: Span[] = []
  for (const s of spans) {
    const last = out[out.length - 1]
    if (last && last.fg === s.fg && last.bg === s.bg && last.b === s.b && last.i === s.i) {
      out[out.length - 1] = { ...last, t: last.t + s.t }
    } else {
      out.push({ ...s })
    }
  }
  return out
}

/** A row of elements laid side by side. */
export function Row(ctx: Ctx, children: readonly RenderElement[], key?: string): RenderElement {
  const { Box } = ctx.el
  return (
    <Box key={key} flexDirection="row">
      {children}
    </Box>
  )
}

/** A column of elements. */
export function Col(ctx: Ctx, children: readonly RenderElement[], key?: string): RenderElement {
  const { Box } = ctx.el
  return (
    <Box key={key} flexDirection="column">
      {children}
    </Box>
  )
}
