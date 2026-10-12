// Agents (boards 1c and 1d): a totals header, an accordion of subagents (a
// collapsed row per agent, an expanded one with its details, children nested
// under their parent), the status chip legend, and the empty state.

import type { RenderElement } from 'claude-code'

import type { AgentRec, FileMark } from '../../../types'
import { agentLabel, isActive, isDone, ordered } from '../../collectors/agents'
import { buildTree, commonDir, markOf, relative, treeLines } from '../../collectors/files'
import type { Mark } from '../../collectors/files'
import { clock, tilde, tok } from '../format'
import { treeRow, isOpen } from './context'
import { center, chip, Col, len, Line, merge, pad, spread, subtitle, title } from '../ui'
import type { Ctx, Span } from '../ui'

export type AgentsData = {
  agents: Record<string, AgentRec>
  files: Record<string, FileMark>
  expanded: ReadonlySet<string>
  /** The main session's branch, which an agent without its own `cwd` shares. */
  branch?: string
  cwd?: string
  home?: string
  root?: string
  /** The avatar for the empty state, drawn by the engine. */
  emptyAvatar: RenderElement
  toggle: (key: string) => void
}

/** `claude-sonnet-5-5` as `Sonnet 5.5`; anything else as given. */
export function prettyModel(model: string | undefined): string {
  if (model === undefined) return '—'
  const m = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(model)
  if (!m) return model
  const family = (m[1] ?? '').charAt(0).toUpperCase() + (m[1] ?? '').slice(1)
  return `${family} ${m[2]}.${m[3]}`
}

/** The status chip word for an agent's status. */
function chipKind(status: AgentRec['status']): string {
  if (status === 'running') return 'running'
  if (status === 'completed') return 'completed'
  if (status === 'failed' || status === 'killed') return 'failed'
  return 'waiting'
}

/** Tokens a collapsed row shows: what it read uncached plus what it wrote. */
export function rowTokens(a: AgentRec): number {
  return a.tokens.input + a.tokens.output
}

function elapsed(a: AgentRec, now: number): string {
  const end = a.endedAt ?? now
  return now > 0 || a.endedAt !== undefined ? clock(Math.max(0, end - a.startedAt)) : '—'
}

/** Wraps text to `w` columns, on spaces where it can. */
export function wrap(text: string, w: number): string[] {
  const out: string[] = []
  for (const para of text.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (line === '') line = word
      else if (len(line) + 1 + len(word) <= w) line += ' ' + word
      else {
        out.push(line)
        line = word
      }
      while (len(line) > w) {
        out.push(Array.from(line).slice(0, w).join(''))
        line = Array.from(line).slice(w).join('')
      }
    }
    out.push(line)
  }
  return out.filter((l, i, all) => l !== '' || (i > 0 && i < all.length - 1))
}

/** The agent that opens by default: the first running one. */
function defaultOpen(list: { rec: AgentRec }[]): string | undefined {
  return list.find(x => isActive(x.rec.status))?.rec.id
}

function header(ctx: Ctx, w: number, a: AgentRec, depth: number, open: boolean, isLast: boolean, onPress: () => void): RenderElement {
  const p = ctx.pal
  const { Button, Text } = ctx.el
  const done = isDone(a.status)
  const guide = depth === 0 ? '' : ' ' + '│ '.repeat(depth - 1) + (isLast ? '└─' : '├─')
  const left: Span[] = [
    { t: guide, fg: p.LN },
    { t: open ? '▾ ' : '▸ ', fg: p.G },
    { t: agentLabel(a), b: true },
    { t: ' · ', fg: p.D },
    { t: a.type, fg: p.D },
  ]
  const right: Span[] = [chip(ctx, chipKind(a.status), a.status === 'killed' ? 'killed' : a.status), { t: ' ' + tok(rowTokens(a)).padStart(5), fg: done ? p.D : p.T }, { t: '  ' + elapsed(a, ctx.now), fg: p.D }]
  const bg = open ? p.TR : undefined
  const spans = spread(w, left, right).map(s => (bg && !s.bg ? { ...s, bg } : s))
  return (
    <Button key={`agent-${a.id}`} plain onPress={onPress}>
      {merge(spans).map(s => (
        <Text color={s.fg} backgroundColor={s.bg} bold={s.b}>
          {s.t}
        </Text>
      ))}
    </Button>
  )
}

/** A label/value row of the expanded body, as the mockup's `kv()`: the label in 8 cells. */
function kv(ctx: Ctx, label: string, value: Span[], right?: { label: string; value: Span[] }): Span[] {
  const p = ctx.pal
  const left: Span[] = [{ t: label.padEnd(8), fg: p.D }, ...value]
  if (!right) return left
  const used = left.reduce((n, s) => n + len(s.t), 0)
  return [...left, pad(Math.max(1, 27 - used)), { t: right.label.padEnd(8), fg: p.D }, ...right.value]
}

function details(ctx: Ctx, w: number, a: AgentRec, d: AgentsData): RenderElement[] {
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  const X = w - 3
  const parent = a.parentId ? d.agents[a.parentId] : undefined
  const branch = a.branch ?? (a.cwd === undefined ? d.branch : undefined)
  const cwd = a.cwd === undefined ? tilde(d.cwd, d.home) : d.root && a.cwd.startsWith(d.root + '/') ? relative(d.root, a.cwd) : tilde(a.cwd, d.home)
  const rows: Span[][] = [
    kv(ctx, 'model', [{ t: prettyModel(a.model) }], { label: 'effort', value: [chip(ctx, 'effort', a.effort ?? '—')] }),
    kv(ctx, 'branch', [{ t: branch ?? '—' }, ...(a.worktree ? [{ t: '  ▣ worktree', fg: p.G }] : [])]),
    kv(ctx, 'cwd', [{ t: cwd }]),
    kv(ctx, 'bg', [a.background ? { t: 'yes', fg: p.E } : { t: a.background === false ? 'no' : '—' }], {
      label: 'fork',
      value: [{ t: a.fork === undefined ? '—' : a.fork ? 'yes' : 'no' }],
    }),
    kv(ctx, 'parent', [parent ? { t: agentLabel(parent) } : { t: 'main session', fg: p.D }]),
    [],
    subtitle(ctx, X, 'Tokens'),
    [
      { t: 'in ', fg: p.D },
      { t: tok(a.tokens.input) },
      { t: '  out ', fg: p.D },
      { t: tok(a.tokens.output) },
      { t: '  cache r ', fg: p.D },
      { t: tok(a.tokens.cacheRead) },
      { t: '  w ', fg: p.D },
      { t: tok(a.tokens.cacheWrite) },
    ],
    [{ t: 'ctx ', fg: p.D }, { t: a.lastContext === undefined ? '—' : `${tok(a.lastContext)} tokens`, fg: p.E, b: true }],
    [pad(4), { t: `last request · ${a.tokens.requests} request${a.tokens.requests === 1 ? '' : 's'}`, fg: p.D, i: true }],
    [],
    subtitle(ctx, X, 'Task given'),
  ]
  const out: RenderElement[] = rows.map((r, i) => Line(ctx, r, `agent-${a.id}-row-${i}`))
  const prompt = wrap(a.prompt ?? a.description ?? '—', X)
  const moreKey = `agent-more:${a.id}`
  const full = d.expanded.has(moreKey)
  const shown = full ? prompt : prompt.slice(0, 3)
  shown.forEach((l, i) => {
    const cut = !full && i === 2 && prompt.length > 3
    out.push(Line(ctx, [{ t: cut ? Array.from(l).slice(0, X - 1).join('') + '…' : l, fg: p.D, i: true }], `agent-${a.id}-task-${i}`))
  })
  if (prompt.length > 3) {
    out.push(
      <Button key={`agent-more-${a.id}`} plain onPress={() => d.toggle(moreKey)}>
        <Text color={p.G}>{full ? '[ less ]' : '[ more ]'}</Text>
      </Button>,
    )
  }
  out.push(Line(ctx, [], `agent-${a.id}-gap`))
  const mine = Object.entries(d.files).filter(([, m]) => m.agents.includes(a.id))
  const read = mine.filter(([, m]) => !m.edited).length
  const edited = mine.filter(([, m]) => m.edited).length
  out.push(Line(ctx, subtitle(ctx, X, 'Files', `${read} read · ${edited} edited`), `agent-${a.id}-files`))
  if (mine.length === 0) {
    out.push(Line(ctx, [{ t: 'No file read or edited.', fg: p.D, i: true }], `agent-${a.id}-nofiles`))
  } else {
    const rels = mine.map(([path, m]): [string, Mark] => [d.root ? relative(d.root, path) : path, markOf(m)])
    const base = commonDir(rels.map(([r]) => r))
    const tree = buildTree(base === '' ? '.' : base, rels.map(([r, m]): [string, Mark] => [base === '' ? r : r.slice(base.length + 1), m]))
    for (const l of treeLines(tree, { toggled: new Set(), untouchedListed: 6, maxLines: 12 })) out.push(treeRow(ctx, X, l, `agent-${a.id}-tree-`))
  }
  return [
    <Box key={`agent-${a.id}-body`} flexDirection="row">
      <Box flexDirection="column" width={3}>
        {out.map((_, i) => Line(ctx, [pad(1), { t: '│', fg: p.LN }], `agent-${a.id}-guide-${i}`))}
      </Box>
      {Col(ctx, out, `agent-${a.id}-col`)}
    </Box>,
  ]
}

function legend(ctx: Ctx): RenderElement {
  return Line(ctx, [chip(ctx, 'running'), pad(1), chip(ctx, 'waiting'), pad(1), chip(ctx, 'completed'), pad(1), chip(ctx, 'failed')], 'agents-legend')
}

function empty(ctx: Ctx, w: number, d: AgentsData): RenderElement {
  const p = ctx.pal
  const { Box } = ctx.el
  return (
    <Box key="agents" flexDirection="column" width={w}>
      {Line(ctx, title(ctx, w, 'Agents', '0 agents'), 'agents-title')}
      {[1, 2, 3, 4, 5].map(i => Line(ctx, [], `agents-gap-${i}`))}
      <Box key="agents-empty-avatar" paddingLeft={Math.max(0, Math.floor((w - 44) / 2))}>
        {d.emptyAvatar}
      </Box>
      {Line(ctx, center(w, [{ t: '▀'.repeat(Math.min(42, w - 2)), fg: p.glow }]), 'agents-glow')}
      {Line(ctx, [], 'agents-gap-6')}
      {Line(ctx, [], 'agents-gap-7')}
      {Line(ctx, center(w, [{ t: 'No party members deployed.', b: true }]), 'agents-empty-title')}
      {Line(ctx, [], 'agents-gap-8')}
      {Line(ctx, center(w, [{ t: 'Agents will appear here when Claude launches them.', fg: p.D }]), 'agents-empty-text')}
    </Box>
  )
}

export function agentsTab(ctx: Ctx, d: AgentsData): RenderElement {
  const w = ctx.width
  const list = ordered(d.agents)
  if (list.length === 0) return empty(ctx, w, d)
  const { Box } = ctx.el
  const running = list.filter(x => isActive(x.rec.status)).length
  const total = list.reduce((n, x) => n + rowTokens(x.rec), 0)
  const rows: RenderElement[] = [
    Line(ctx, title(ctx, w, 'Agents', `${list.length} agent${list.length === 1 ? '' : 's'} · ${running} running · ${tok(total)} tokens`, ctx.pal.T), 'agents-title'),
    Line(ctx, [], 'agents-gap'),
  ]
  const first = defaultOpen(list)
  list.forEach((x, i) => {
    const key = `agent:${x.rec.id}`
    const open = isOpen(d.expanded, key, x.rec.id === first)
    const next = list[i + 1]
    const isLast = next === undefined || next.depth < x.depth
    rows.push(header(ctx, w, x.rec, x.depth, open, isLast, () => d.toggle(key)))
    if (open) rows.push(...details(ctx, w, x.rec, d))
  })
  rows.push(Line(ctx, [], 'agents-gap-end'))
  rows.push(legend(ctx))
  return (
    <Box key="agents" flexDirection="column" width={w}>
      {rows}
    </Box>
  )
}
