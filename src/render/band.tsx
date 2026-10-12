// The band above the prompt (board 2c): one line with the branch, model,
// effort, context fill and its bar, the 5h window and the session cost, and on
// the right whether a turn runs and how to open the HUD. Pure.

import type { RenderElement } from 'claude-code'

import type { UsageSnap } from '../../types'
import { pct, usd } from './format'
import { bar, Line, len, merge, pad } from './ui'
import type { Ctx, Span } from './ui'

export type BandData = {
  branch?: string
  model?: string
  effort?: string
  usage: UsageSnap | null
  threshold: number
  isWorking: boolean
  open: () => void
}

export function bandSpans(ctx: Ctx, d: BandData): { left: Span[]; right: Span[] } {
  const p = ctx.pal
  const percent = d.usage?.contextPercent
  const crit = percent !== undefined && percent >= d.threshold
  const color = percent !== undefined && percent >= 60 ? p.G : p.E
  const five = d.usage?.rateLimits.find(r => r.kind === 'five_hour')
  const dot: Span = { t: ' · ', fg: p.D }
  const left: Span[] = [
    pad(1),
    { t: '⎇ ', fg: p.E },
    { t: d.branch ?? '—', b: true },
    dot,
    { t: d.model ?? '—' },
    dot,
    { t: d.effort ?? '—', fg: p.G },
    dot,
    { t: 'ctx ', fg: p.D },
    crit ? { t: pct(percent), fg: p.T, bg: p.R, b: true } : { t: pct(percent), fg: color, b: true },
    pad(1),
    ...bar((percent ?? 0) / 100, 8, color, p.TR),
    dot,
    { t: '5h ', fg: p.D },
    five ? { t: pct(five.percentUsed), fg: five.percentUsed >= 60 ? p.G : p.E, b: true } : { t: 'n/a', fg: p.D },
    dot,
    { t: usd(d.usage?.costUsd), fg: p.G, b: true },
  ]
  const right: Span[] = [d.isWorking ? { t: '● live', fg: p.E } : { t: '○ idle', fg: p.D }, pad(2), { t: '/clawd' }, { t: ' open HUD ', fg: p.D }]
  return { left, right }
}

/** The band: the strip's spans on the panel surface, the right end a button that opens the pane. */
export function band(ctx: Ctx, d: BandData): RenderElement {
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  const { left, right } = bandSpans(ctx, d)
  const rw = right.reduce((n, s) => n + len(s.t), 0)
  const lw = left.reduce((n, s) => n + len(s.t), 0)
  const fill = Math.max(1, ctx.width - lw - rw)
  const onSurface = (spans: Span[]) => merge(spans).map(s => (s.bg ? s : { ...s, bg: p.S }))
  return (
    <Box key="band" flexDirection="row" width={ctx.width}>
      {Line(ctx, onSurface([...left, pad(fill)]), 'band-left')}
      <Button key="band-open" plain onPress={d.open}>
        {onSurface(right).map(s => (
          <Text color={s.fg} backgroundColor={s.bg} bold={s.b}>
            {s.t}
          </Text>
        ))}
      </Button>
    </Box>
  )
}
