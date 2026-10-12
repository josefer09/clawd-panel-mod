// Home (board 1a): identity row, usage meters, Clawd and the stats radar, and
// the cost-per-turn sparkline.

import type { RenderElement } from 'claude-code'

import type { AlertState, AvatarState, CostLedger, RateLimitSnap, TokenTotals, UsageSnap } from '../../../types'
import { cacheHit, outIn } from '../../collectors/session'
import { duration, k, pct, tilde, until, usd, weekdayTime, ago } from '../format'
import { meterSpans } from '../raster/bars'
import { pack } from '../raster/cells'
import type { Cell } from '../raster/cells'
import { radarCanvas, radarSvg } from '../raster/radar'
import type { Axis } from '../raster/radar'
import { sparkCells } from '../raster/sparkline'
import { STATE_TEXT } from '../raster/sprite'
import { chip, Col, Line, pad, Row, spread, title, width } from '../ui'
import type { Ctx, Span } from '../ui'

export type HomeData = {
  branch?: string
  ahead?: number
  behind?: number
  model?: string
  effort?: string
  turns: number
  cwd?: string
  home?: string
  usage: UsageSnap | null
  tokens: TokenTotals
  cost: CostLedger
  alert: AlertState
  threshold: number
  avatarState: AvatarState
  level: number
  /** How the context figures were counted: the breakdown's `summary` or `full`. */
  detail: string
  /** The avatar, drawn by the engine (Image or Raster), 24 wide and 14 tall. */
  avatar: RenderElement
  refresh: () => void
}

/** The rate-limit row of a window, or its absence spelled out. */
function limitMeter(ctx: Ctx, w: number, label: string, limit: RateLimitSnap | undefined, hasUsage: boolean, windowWord: string) {
  const p = ctx.pal
  if (limit === undefined) {
    return meterSpans({ label, frac: 0, color: p.D, detail: hasUsage ? 'n/a (API key)' : '—', value: 'n/a' }, w, p)
  }
  const frac = limit.percentUsed / 100
  return meterSpans({ label, frac, color: frac >= 0.6 ? p.G : p.E, detail: windowWord, value: pct(limit.percentUsed) }, w, p)
}

export function contextMeter(ctx: Ctx, w: number, u: UsageSnap | null, threshold: number): Span[] {
  const p = ctx.pal
  const percent = u?.contextPercent
  const crit = percent !== undefined && percent >= threshold
  return meterSpans(
    {
      label: 'Context',
      frac: percent === undefined ? 0 : percent / 100,
      color: percent !== undefined && percent >= 60 ? p.G : p.E,
      detail: `${k(u?.contextTokens)} / ${k(u?.contextWindow)}`,
      value: pct(percent),
      isCritical: crit,
    },
    w,
    p,
  )
}

export function radarAxes(u: UsageSnap | null, t: TokenTotals, threshold: number): Axis[] {
  const five = u?.rateLimits.find(r => r.kind === 'five_hour')
  const seven = u?.rateLimits.find(r => r.kind === 'seven_day')
  const hit = cacheHit(t)
  const oi = outIn(t)
  const ctxPct = u?.contextPercent
  return [
    { label: 'CTX', value: pct(ctxPct), frac: (ctxPct ?? 0) / 100, alert: ctxPct !== undefined && ctxPct >= threshold },
    { label: '5H', value: five ? pct(five.percentUsed) : 'n/a', frac: (five?.percentUsed ?? 0) / 100 },
    { label: '7D', value: seven ? pct(seven.percentUsed) : 'n/a', frac: (seven?.percentUsed ?? 0) / 100 },
    { label: 'CACHE', value: hit === undefined ? '—' : pct(hit * 100), frac: hit ?? 0 },
    { label: 'O/I', value: oi === undefined ? '—' : oi.toFixed(2), frac: Math.min(1, oi ?? 0) },
  ]
}

/** The identity rows: branch, model, effort, duration, turns, cwd. */
export function identity(ctx: Ctx, w: number, d: HomeData, withCwd: boolean): RenderElement[] {
  const p = ctx.pal
  const branch: Span[] = [
    { t: '⎇ ', fg: p.E },
    { t: d.branch ?? '—', b: true },
    ...(d.ahead !== undefined ? [{ t: `  ↑${d.ahead} ↓${d.behind ?? 0}`, fg: p.D }] : []),
  ]
  const model: Span[] = [{ t: 'model ', fg: p.D }, { t: d.model ?? '—', b: true }]
  const effort: Span[] = [{ t: 'effort ', fg: p.D }, chip(ctx, 'effort', d.effort ?? '—')]
  const started = d.usage?.startedAt
  const since: Span[] = [
    { t: started && ctx.now ? duration(ctx.now - started) : '—' },
    { t: ' · ', fg: p.D },
    { t: String(d.turns) },
    { t: ' turns', fg: p.D },
  ]
  const rows = [Line(ctx, spread(w, branch, model), 'id-1'), Line(ctx, spread(w, effort, since), 'id-2')]
  if (withCwd) {
    const { Box, Button, Text } = ctx.el
    rows.push(
      <Box key="id-3" flexDirection="row" width={w}>
        <Box flexGrow={1}>{Line(ctx, [{ t: 'cwd ', fg: p.D }, { t: tilde(d.cwd, d.home), fg: p.D }])}</Box>
        <Button key="refresh" plain onPress={d.refresh}>
          <Text color={p.G}>[ Refresh ]</Text>
        </Button>
      </Box>,
    )
  }
  return rows
}

/** The usage block: title, the three meters with their resets, and the cost line. */
export function usageBlock(ctx: Ctx, w: number, d: HomeData, compact: boolean): RenderElement[] {
  const p = ctx.pal
  const u = d.usage
  const five = u?.rateLimits.find(r => r.kind === 'five_hour')
  const seven = u?.rateLimits.find(r => r.kind === 'seven_day')
  const note = u ? `${d.detail} · ${ago(u.at, ctx.now)}` : 'not read yet'
  const rows: RenderElement[] = [Line(ctx, title(ctx, w, 'Usage', compact ? undefined : note), 'usage-title')]
  rows.push(Line(ctx, contextMeter(ctx, w, u, d.threshold), 'meter-context'))
  const fiveReset = until(five?.resetsAt, ctx.now)
  const sevenReset = weekdayTime(seven?.resetsAt)
  if (compact) {
    rows.push(Line(ctx, limitMeter(ctx, w, 'Session', five, u !== null, fiveReset ? `↻ ${fiveReset}` : '5h window'), 'meter-5h'))
    rows.push(Line(ctx, limitMeter(ctx, w, 'Weekly', seven, u !== null, sevenReset ? `↻ ${sevenReset}` : '7d window'), 'meter-7d'))
  } else {
    rows.push(Line(ctx, limitMeter(ctx, w, 'Session', five, u !== null, '5h window'), 'meter-5h'))
    if (fiveReset) rows.push(Line(ctx, [pad(9), { t: `resets in ${fiveReset}`, fg: p.D }], 'reset-5h'))
    rows.push(Line(ctx, limitMeter(ctx, w, 'Weekly', seven, u !== null, '7d window'), 'meter-7d'))
    if (sevenReset) rows.push(Line(ctx, [pad(9), { t: `resets ${sevenReset}`, fg: p.D }], 'reset-7d'))
  }
  const avg = u?.costUsd !== undefined && d.turns > 0 ? u.costUsd / d.turns : undefined
  rows.push(
    Line(
      ctx,
      [
        { t: 'Cost', fg: p.D },
        pad(5),
        { t: usd(u?.costUsd), fg: p.G, b: true },
        { t: ` session · avg ${usd(avg)}/turn`, fg: p.D },
      ],
      'cost',
    ),
  )
  return rows
}

/** The radar and its labels: a Raster on the terminal, an Svg elsewhere. */
export function radarBlock(ctx: Ctx, w: number, axes: readonly Axis[], r = 8, x = 5): RenderElement {
  const { Raster, Svg } = ctx.extra
  if (Raster) {
    const c = radarCanvas(axes, r, x, w, ctx.pal)
    return <Raster key="radar" columns={c.width} rows={c.height} cells={pack(c.cells, c.width)} />
  }
  if (Svg) return <Svg key="radar" source={radarSvg(axes, ctx.pal)} alt={axes.map(a => `${a.label} ${a.value}`).join(', ')} width={180} height={180} />
  return Col(
    ctx,
    axes.map(a => Line(ctx, [{ t: a.label.padEnd(6), fg: ctx.pal.D }, { t: a.value, b: true }])),
    'radar',
  )
}

/** The sparkline's cells as an element: a Raster on the terminal, lines of text elsewhere. */
export function cellsBlock(ctx: Ctx, key: string, rows: Cell[][]): RenderElement {
  const { Raster } = ctx.extra
  const columns = rows.reduce((n, r) => Math.max(n, r.length), 0)
  if (Raster && columns > 0) return <Raster key={key} columns={columns} rows={rows.length} cells={pack(rows, columns)} />
  return Col(
    ctx,
    rows.map(r => Line(ctx, r.map(c => ({ t: c.ch, ...(c.fg ? { fg: c.fg } : {}) })))),
    key,
  )
}

export function costBlock(ctx: Ctx, w: number, d: HomeData): RenderElement[] {
  const p = ctx.pal
  const turns = d.cost.turns
  const rows: RenderElement[] = [Line(ctx, title(ctx, w, 'Cost / turn', `${usd(d.usage?.costUsd)} · ${turns.length} turns`), 'spark-title')]
  if (turns.length === 0) {
    rows.push(Line(ctx, [{ t: 'No turn has ended yet.', fg: p.D, i: true }], 'spark-empty'))
    return rows
  }
  const barW = Math.max(8, Math.min(turns.length, w - 15))
  const shown = turns.slice(-barW)
  const first = turns.length - shown.length + 1
  const mx = Math.max(...shown)
  const mi = shown.indexOf(mx)
  const last = shown[shown.length - 1] ?? 0
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length
  const stats: Span[][] = [
    [{ t: 'max ', fg: p.D }, { t: usd(mx), fg: p.G, b: true }],
    [{ t: `t${first + mi}`, fg: p.D }],
    [],
    [{ t: 'avg ', fg: p.D }, { t: usd(avg) }],
    [],
    [{ t: 'last ', fg: p.D }, { t: usd(last), fg: p.E, b: true }],
  ]
  const { Box } = ctx.el
  rows.push(
    <Box key="spark" flexDirection="row">
      {cellsBlock(ctx, 'spark-cells', sparkCells(shown, 6, p))}
      <Box flexDirection="column" marginLeft={2}>
        {stats.map((s, i) => Line(ctx, s, `spark-stat-${i}`))}
      </Box>
    </Box>,
  )
  const left = `t${first}`
  const right = `t${turns.length}`
  const axis: Span[] = shown.length === 1 ? [{ t: left, fg: p.D }] : [{ t: left, fg: p.D }, pad(Math.max(1, shown.length - left.length - right.length)), { t: right, fg: p.D }]
  rows.push(Line(ctx, axis, 'spark-axis'))
  return rows
}

/** Clawd: the title, the picture, its glow, and the level and state line. */
export function clawdBlock(ctx: Ctx, w: number, d: HomeData): RenderElement[] {
  const p = ctx.pal
  return [
    Line(ctx, title(ctx, w, 'Clawd'), 'clawd-title'),
    d.avatar,
    Line(ctx, [pad(1), { t: '▀'.repeat(22), fg: p.glow }], 'glow'),
    Line(ctx, [{ t: `Lv. ${d.level}`, fg: p.G, b: true }, { t: ' · ', fg: p.D }, { t: STATE_TEXT[d.avatarState], fg: p.E }], 'clawd-state'),
  ]
}

export function home(ctx: Ctx, d: HomeData): RenderElement {
  const w = ctx.width
  const { Box } = ctx.el
  const axes = radarAxes(d.usage, d.tokens, d.threshold)
  const twoUp = w >= 50
  const statsW = twoUp ? w - 25 : w
  const stats: RenderElement[] = [Line(ctx, title(ctx, statsW, 'Stats'), 'stats-title'), Line(ctx, [], 'stats-gap'), radarBlock(ctx, statsW, axes, 8, Math.min(5, Math.max(4, statsW - 22)))]
  const clawd = clawdBlock(ctx, 24, d)
  return (
    <Box key="home" flexDirection="column" width={w}>
      {identity(ctx, w, d, true)}
      {Line(ctx, [], 'gap-1')}
      {usageBlock(ctx, w, d, false)}
      {Line(ctx, [], 'gap-2')}
      {twoUp ? Row(ctx, [Col(ctx, clawd, 'clawd'), <Box width={1} />, Col(ctx, stats, 'stats')], 'clawd-stats') : Col(ctx, [...clawd, ...stats], 'clawd-stats')}
      {Line(ctx, [], 'gap-3')}
      {costBlock(ctx, w, d)}
    </Box>
  )
}

