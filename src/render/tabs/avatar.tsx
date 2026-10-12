// Avatar (board 1f): the animated preview with its facts, the four state
// frames, the sprite source fields, the render mode, and Reset and Preview.

import type { RenderElement } from 'claude-code'

import type { AvatarConfig, AvatarState, RenderMode } from '../../../types'
import type { Terminal } from '../../collectors/terminal'
import type { Pixels } from '../raster/cells'
import { FPS, STATES } from '../raster/sprite'
import { cellsBlock } from './home'
import { halfBlocks } from '../raster/cells'
import { center, Col, Line, pad, title } from '../ui'
import type { Ctx, Span } from '../ui'

export type AvatarData = {
  config: AvatarConfig
  state: AvatarState
  /** The picture drawn in the preview, built by the engine (Image or Raster). */
  preview: RenderElement
  /** Each state's first frame at half size, for the thumbnails. */
  thumbs: Record<AvatarState, Pixels>
  frame: number
  frameCount: number
  /** Frame size in pixels, and how the preview draws it. */
  canvas: { w: number; h: number }
  drawn: 'image' | 'cells'
  source: string
  note: string
  terminal: Terminal
  previewing: boolean
  setSpritePath: (path: string) => void
  setSheetPath: (path: string) => void
  setFramesPerRow: (text: string) => void
  setMode: (mode: RenderMode) => void
  reset: () => void
  togglePreview: () => void
}

export const MODES: readonly { value: RenderMode; label: string }[] = [
  { value: 'auto', label: 'Auto (Image where the terminal draws it)' },
  { value: 'image', label: 'Image (kitty, Ghostty)' },
  { value: 'cells', label: 'Pixel cells (any truecolor terminal)' },
]

function facts(ctx: Ctx, d: AvatarData): RenderElement[] {
  const p = ctx.pal
  const rows: [string, Span[]][] = [
    ['state', [{ t: d.previewing ? 'preview' : d.state, fg: p.E }]],
    ['frame', [{ t: `${(d.frame % d.frameCount) + 1} / ${d.frameCount}` }]],
    ['canvas', [{ t: `${d.canvas.w}×${d.canvas.h} px` }]],
    ['cells', [{ t: d.drawn === 'image' ? `${d.canvas.w}×${Math.ceil(d.canvas.h / 2)} image` : `${d.canvas.w}×${Math.ceil(d.canvas.h / 2)} half-block` }]],
    ['fps', [{ t: String(FPS) }]],
    ['source', [{ t: d.source, fg: p.D }]],
  ]
  const out: RenderElement[] = [Line(ctx, [], 'facts-gap-0')]
  rows.forEach(([k, v], i) => {
    out.push(Line(ctx, [{ t: k.padEnd(7), fg: p.D }, ...v], `fact-${k}`))
    if (i < rows.length - 1) out.push(Line(ctx, [], `facts-gap-${i + 1}`))
  })
  return out
}

function previewBox(ctx: Ctx, d: AvatarData): RenderElement {
  const p = ctx.pal
  const { Box } = ctx.el
  return (
    <Box key="avatar-box" flexDirection="column" borderStyle="round" borderColor={p.LN} width={26} paddingX={0}>
      {d.preview}
      {Line(ctx, [pad(1), { t: '▀'.repeat(22), fg: p.glow }], 'avatar-glow')}
    </Box>
  )
}

function thumbs(ctx: Ctx, w: number, d: AvatarData): RenderElement[] {
  const p = ctx.pal
  const { Box } = ctx.el
  const pics = STATES.map(s => (
    <Box key={`thumb-box-${s}`} flexDirection="column" width={13}>
      {cellsBlock(ctx, `thumb-${s}`, halfBlocks(d.thumbs[s]))}
    </Box>
  ))
  const labels: Span[] = []
  STATES.forEach(s => {
    const label = ` ${s} `
    const on = s === d.state && !d.previewing
    const cell = center(12, [on ? { t: label, fg: p.T, bg: p.R, b: true } : { t: label, fg: p.D }])
    labels.push(...cell, pad(13 - cell.reduce((n, x) => n + x.t.length, 0)))
  })
  return [
    Line(ctx, title(ctx, w, 'Frames', `${STATES.length} states`), 'frames-title'),
    <Box key="thumbs" flexDirection="row">
      {pics}
    </Box>,
    Line(ctx, labels, 'thumb-labels'),
  ]
}

function source(ctx: Ctx, w: number, d: AvatarData): RenderElement[] {
  const p = ctx.pal
  const { Input } = ctx.extra
  const rows: RenderElement[] = [Line(ctx, title(ctx, w, 'Source'), 'source-title')]
  if (!Input) {
    rows.push(Line(ctx, [{ t: `sprite ${d.config.spritePath || '—'} · sheet ${d.config.sheetPath || '—'} · ${d.config.framesPerRow}/row`, fg: p.D }], 'source-read-only'))
    rows.push(Line(ctx, [{ t: 'Set these from the terminal or the desktop app.', fg: p.D, i: true }], 'source-hint'))
    return rows
  }
  rows.push(
    <Input key="sprite-path" label="Sprite path" placeholder="~/sprites/clawd.png" value={d.config.spritePath} submitLabel="load" onSubmit={value => d.setSpritePath(value)} />,
    <Input key="sheet-path" label="Sheet" placeholder="~/sprites/clawd-sheet.png" value={d.config.sheetPath} submitLabel="load" onSubmit={value => d.setSheetPath(value)} />,
    <Input key="frames-per-row" label="Frames/row" placeholder="4" value={String(d.config.framesPerRow)} submitLabel="set" onSubmit={value => d.setFramesPerRow(value)} />,
    Line(ctx, [pad(12), { t: `frame ${d.canvas.w}×${d.canvas.h}`, fg: p.D }], 'frame-size'),
  )
  if (d.note) rows.push(Line(ctx, [{ t: d.note, fg: d.note.startsWith('Loaded') ? p.E : p.R }], 'avatar-note'))
  return rows
}

function mode(ctx: Ctx, w: number, d: AvatarData): RenderElement[] {
  const p = ctx.pal
  const { Select } = ctx.extra
  const rows: RenderElement[] = [Line(ctx, title(ctx, w, 'Render mode'), 'mode-title')]
  if (Select) {
    rows.push(<Select key="render-mode" label="Mode" options={MODES} value={d.config.mode} onSelect={value => d.setMode(value as RenderMode)} />)
  } else {
    rows.push(Line(ctx, [{ t: MODES.find(m => m.value === d.config.mode)?.label ?? d.config.mode }], 'mode-read-only'))
  }
  const avail = d.terminal.images ? 'image protocol available' : 'image protocol not available'
  rows.push(Line(ctx, [pad(4), { t: `detected: ${d.terminal.name} · ${avail}`, fg: p.D, i: true }], 'mode-detected'))
  return rows
}

function actions(ctx: Ctx, d: AvatarData): RenderElement {
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  return (
    <Box key="avatar-actions" flexDirection="row" columnGap={2}>
      <Button key="avatar-reset" plain onPress={d.reset}>
        <Text color={p.G}>[ Reset to Clawd ]</Text>
      </Button>
      <Button key="avatar-preview-anim" plain onPress={d.togglePreview}>
        <Text color={p.M} bold>
          {d.previewing ? '[ Stop preview ]' : '[ Preview animation ]'}
        </Text>
      </Button>
    </Box>
  )
}

export function avatarTab(ctx: Ctx, d: AvatarData): RenderElement {
  const w = ctx.width
  const { Box } = ctx.el
  const top = w >= 46 ? (
    <Box key="avatar-top" flexDirection="row" columnGap={2}>
      {previewBox(ctx, d)}
      {Col(ctx, facts(ctx, d), 'facts')}
    </Box>
  ) : (
    Col(ctx, [previewBox(ctx, d), ...facts(ctx, d)], 'avatar-top')
  )
  return (
    <Box key="avatar" flexDirection="column" width={w}>
      {Line(ctx, title(ctx, w, 'Avatar', `state: ${d.previewing ? 'preview' : d.state}`), 'avatar-title')}
      {top}
      {Line(ctx, [], 'avatar-gap-1')}
      {thumbs(ctx, w, d)}
      {Line(ctx, [], 'avatar-gap-2')}
      {source(ctx, w, d)}
      {Line(ctx, [], 'avatar-gap-3')}
      {mode(ctx, w, d)}
      {Line(ctx, [], 'avatar-gap-4')}
      {actions(ctx, d)}
    </Box>
  )
}

