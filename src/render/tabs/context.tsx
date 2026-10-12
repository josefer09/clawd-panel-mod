// Context (board 1b): the window as /context breaks it down (stacked bar,
// grid and legend), the Precise recount button, the expandable MCP, memory,
// skills and custom-agent lists, and the tree of files the session read,
// edited or left untouched.

import type { RenderElement } from 'claude-code'

import type { BreakdownSnap, CategorySnap, FileMark, TrackedFiles } from '../../../types'
import { barCategories, sumTokens, tokensPerSquare } from '../../collectors/context'
import { buildTree, repoEntries, relative, totals, treeLines } from '../../collectors/files'
import type { Counts, Mark, TreeLine } from '../../collectors/files'
import type { Palette } from '../../theme'
import { ago, k, tilde } from '../format'
import { stackedCells } from '../raster/bars'
import type { Cell } from '../raster/cells'
import { cellsBlock } from './home'
import { Col, len, Line, pad, Row, spread, title } from '../ui'
import type { Ctx, Span } from '../ui'

export type ContextData = {
  breakdown: BreakdownSnap | null
  showGrid: boolean
  expanded: ReadonlySet<string>
  recounting: boolean
  compactions: number
  files: Record<string, FileMark>
  tracked: TrackedFiles | null
  cwd?: string
  home?: string
  toggle: (key: string) => void
  toggleGrid: () => void
  recount: () => void
}

/** The colors and patterns of the mockup's `CAT` table, by /context's category names. */
const CATEGORY: Record<string, (p: Palette) => { color: string; glyph: string; pattern?: 'free' | 'buffer' }> = {
  'System prompt': () => ({ color: '#8A8580', glyph: '■' }),
  'System tools': () => ({ color: '#B5AFA8', glyph: '■' }),
  'MCP tools': p => ({ color: p.M, glyph: '■' }),
  'Custom agents': () => ({ color: '#8E3A5A', glyph: '■' }),
  'Memory files': p => ({ color: p.G, glyph: '■' }),
  Skills: () => ({ color: '#E9C77A', glyph: '■' }),
  Messages: p => ({ color: p.R, glyph: '■' }),
}

/** Colors for categories the mockup does not name, in order. */
const EXTRA = ['#5F8F87', '#7A6FA0', '#A07A5F', '#6F8FA0', '#9A9A5F']

export function categoryStyle(c: Pick<CategorySnap, 'name' | 'kind'>, index: number, p: Palette): { color: string; glyph: string; pattern?: 'free' | 'buffer' } {
  if (c.kind === 'free') return { color: p.FD, glyph: '·', pattern: 'free' }
  if (c.kind === 'buffer') return { color: p.D, glyph: '░', pattern: 'buffer' }
  const known = CATEGORY[c.name]
  return known ? known(p) : { color: EXTRA[index % EXTRA.length] ?? p.D, glyph: '■' }
}

/** Whether a section is open: its default, flipped when the person toggled it. */
export function isOpen(expanded: ReadonlySet<string>, key: string, byDefault: boolean): boolean {
  return expanded.has(key) ? !byDefault : byDefault
}

function k1(n: number): string {
  return `${(n / 1000).toFixed(1)}k`
}

/** The stacked bar (two rows) and its axis. */
function barBlock(ctx: Ctx, w: number, b: BreakdownSnap): RenderElement[] {
  const p = ctx.pal
  const cats = barCategories(b)
  const segments = cats.map((c, i) => {
    const st = categoryStyle(c, i, p)
    return { tokens: c.tokens, color: st.color, ...(st.pattern ? { pattern: st.pattern } : {}) }
  })
  const rows = stackedCells(segments, b.rawMaxTokens, w, 2, p)
  const axis: Span[] = []
  const marks = [0, 1, 2, 3].map(q => ({ at: Math.round((q * w) / 4), text: q === 0 ? '0' : k(Math.round((b.rawMaxTokens * q) / 4)) }))
  let col = 0
  for (const m of marks) {
    const at = Math.max(col, m.at)
    axis.push(pad(at - col), { t: m.text, fg: p.D })
    col = at + len(m.text)
  }
  const end = k(b.rawMaxTokens)
  axis.push(pad(w - col - len(end)), { t: end, fg: p.D })
  return [cellsBlock(ctx, 'ctx-bar', rows), Line(ctx, axis, 'ctx-axis')]
}

/** The /context grid: one glyph per square, two cells apart. */
function gridCells(b: BreakdownSnap, p: Palette): Cell[][] {
  const index = new Map(b.categories.map((c, i) => [c.name, { c, i }]))
  return b.grid.map(row => {
    const out: Cell[] = []
    row.forEach((sq, x) => {
      const hit = index.get(sq.categoryName)
      const st = hit ? categoryStyle(hit.c, hit.i, p) : { color: p.FD, glyph: '·' }
      const glyph = st.glyph === '■' && sq.fullness < 0.7 ? '□' : st.glyph
      out.push({ ch: glyph, fg: st.glyph === '·' ? p.FD : st.color })
      if (x < row.length - 1) out.push({ ch: ' ' })
    })
    return out
  })
}

function legendRows(ctx: Ctx, w: number, b: BreakdownSnap, perSquare: number | undefined): RenderElement[] {
  const p = ctx.pal
  const window = b.rawMaxTokens
  const rows = b.categories
    .filter(c => c.kind !== 'deferred')
    .map((c, i) => {
      const st = categoryStyle(c, i, p)
      const left: Span[] = [{ t: st.glyph, fg: st.pattern ? (st.pattern === 'free' ? p.FD : p.D) : st.color }, pad(1), { t: c.name, fg: st.pattern ? p.D : p.T }]
      const share = window > 0 ? ((c.tokens / window) * 100).toFixed(1) + '%' : '—'
      const right: Span[] = [{ t: k1(c.tokens) }, pad(6 - len(share)), { t: share, fg: p.D }]
      return Line(ctx, spread(w, left, right), `legend-${c.name}`)
    })
  if (perSquare !== undefined && perSquare > 0) rows.push(Line(ctx, [{ t: `■ = ${k(perSquare)} tokens`, fg: p.D }], 'legend-square'))
  return rows
}

/** One expandable row: arrow, label, count, a dotted leader and the tokens. */
function sectionRow(ctx: Ctx, w: number, key: string, open: boolean, label: string, count: string, tokens: number, indent: number, onPress: () => void): RenderElement {
  const p = ctx.pal
  const { Button, Text } = ctx.el
  const head = `${' '.repeat(indent)}${open ? '▾ ' : '▸ '}`
  const amount = k1(tokens)
  const lead = Math.max(1, w - len(head) - len(label) - len(count) - len(amount) - 2)
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={p.G}>{head}</Text>
      <Text bold={indent === 0}>{label}</Text>
      <Text color={p.D}>{count}</Text>
      <Text color={p.LN}>{' ' + '·'.repeat(lead) + ' '}</Text>
      <Text>{amount}</Text>
    </Button>
  )
}

/** A leaf row of a section: a name, a dotted leader and the tokens. */
function leafRow(ctx: Ctx, w: number, key: string, name: string, tokens: number, indent: number, dim = false): RenderElement {
  const p = ctx.pal
  const amount = k1(tokens)
  const shown = name.length > w - indent - len(amount) - 3 ? '…' + name.slice(-(w - indent - len(amount) - 4)) : name
  const lead = Math.max(1, w - indent - len(shown) - len(amount) - 2)
  return Line(ctx, [pad(indent), { t: shown, fg: dim ? p.D : p.T }, { t: ' ' + '·'.repeat(lead) + ' ', fg: p.LN }, { t: amount, fg: dim ? p.D : p.T }], key)
}

function sections(ctx: Ctx, w: number, d: ContextData, b: BreakdownSnap): RenderElement[] {
  const rows: RenderElement[] = []
  const servers = b.mcpServers
  const mcpOpen = isOpen(d.expanded, 'ctx:mcp', true)
  rows.push(sectionRow(ctx, w, 'ctx-mcp', mcpOpen, 'MCP tools', `  ${servers.length} server${servers.length === 1 ? '' : 's'}`, sumTokens(servers), 0, () => d.toggle('ctx:mcp')))
  if (mcpOpen) {
    for (const s of servers) {
      const key = `ctx:mcp:${s.name}`
      const open = isOpen(d.expanded, key, false)
      const deferred = s.tools - s.loaded
      rows.push(sectionRow(ctx, w, `ctx-mcp-${s.name}`, open, s.name, deferred > 0 ? `  ${deferred} deferred` : '', s.tokens, 2, () => d.toggle(key)))
      if (open) for (const t of s.items) rows.push(leafRow(ctx, w, `ctx-mcp-${s.name}-${t.name}`, t.isLoaded ? t.name : `${t.name} (deferred)`, t.tokens, 6, !t.isLoaded))
    }
  }
  const memOpen = isOpen(d.expanded, 'ctx:memory', true)
  const mem = b.memoryFiles
  rows.push(sectionRow(ctx, w, 'ctx-memory', memOpen, 'Memory files', `  ${mem.length} file${mem.length === 1 ? '' : 's'}`, sumTokens(mem), 0, () => d.toggle('ctx:memory')))
  if (memOpen) {
    for (const f of mem) {
      const base = d.tracked?.root ?? d.cwd
      const name = base && f.path.startsWith(base + '/') ? relative(base, f.path) : tilde(f.path, d.home)
      rows.push(leafRow(ctx, w, `ctx-memory-${f.path}`, name, f.tokens, 4))
    }
  }
  const skills = b.skills
  const skillsOpen = isOpen(d.expanded, 'ctx:skills', false)
  rows.push(sectionRow(ctx, w, 'ctx-skills', skillsOpen, 'Skills', skills ? `  ${skills.included} loaded` : '  none', skills?.tokens ?? 0, 0, () => d.toggle('ctx:skills')))
  if (skillsOpen && skills) for (const s of skills.items) rows.push(leafRow(ctx, w, `ctx-skill-${s.name}`, s.name, s.tokens, 4))
  const agents = b.customAgents
  const agentsOpen = isOpen(d.expanded, 'ctx:agents', false)
  rows.push(sectionRow(ctx, w, 'ctx-agents', agentsOpen, 'Custom agents', `  ${agents.length} defined`, sumTokens(agents), 0, () => d.toggle('ctx:agents')))
  if (agentsOpen) for (const a of agents) rows.push(leafRow(ctx, w, `ctx-agent-${a.agentType}`, `${a.agentType} (${a.source})`, a.tokens, 4))
  return rows
}

const GLYPH: Record<Mark, string> = { read: '●', edited: '✎', untouched: '○' }

function markColor(m: Mark, p: Palette): string {
  return m === 'read' ? p.E : m === 'edited' ? p.G : p.D
}

function countSpans(c: Counts, p: Palette): Span[] {
  const out: Span[] = []
  if (c.read) out.push({ t: `${c.read}●`, fg: p.E })
  if (c.edited) out.push({ t: `${out.length ? ' ' : ''}${c.edited}✎`, fg: p.G })
  if (c.untouched) out.push({ t: `${out.length ? ' ' : ''}${c.untouched}○`, fg: p.D })
  return out
}

/** One row of a files tree: a directory toggles open and closed, a file is text. */
export function treeRow(ctx: Ctx, w: number, l: TreeLine, keyPrefix: string, onToggle?: (path: string, open: boolean) => void): RenderElement {
  const p = ctx.pal
  const { Button, Text } = ctx.el
  if (l.kind === 'dir') {
    const glyph = l.isOpen ? '▾' : '▸'
    const counts = l.isOpen ? [] : countSpans(l.counts ?? { read: 0, edited: 0, untouched: 0 }, p)
    const used = len(l.prefix) + 2 + len(l.name)
    const cw = counts.reduce((n, s) => n + len(s.t), 0)
    const gap = counts.length ? Math.max(1, w - used - cw) : 0
    const spans: Span[] = [{ t: l.prefix, fg: p.LN }, { t: glyph + ' ', fg: p.G }, { t: l.name }, ...(gap > 0 ? [pad(gap)] : []), ...counts]
    if (onToggle === undefined || l.path === '') return Line(ctx, spans, `${keyPrefix}${l.path ?? ''}`)
    const path = l.path ?? ''
    const open = l.isOpen === true
    return (
      <Button key={`${keyPrefix}${path}`} plain onPress={() => onToggle(path, open)}>
        {spans.map(s => (
          <Text color={s.fg}>{s.t}</Text>
        ))}
      </Button>
    )
  }
  const mark = l.mark ?? 'untouched'
  const spans: Span[] = [{ t: l.prefix, fg: p.LN }]
  if (l.kind === 'more') spans.push({ t: '… ', fg: p.D }, { t: l.name, fg: p.D, i: true })
  else spans.push({ t: GLYPH[mark] + ' ', fg: markColor(mark, p) }, { t: l.name, fg: mark === 'untouched' ? p.D : p.T, b: mark === 'edited' })
  return Line(ctx, spans, `${keyPrefix}${l.prefix}${l.name}`)
}

function filesBlock(ctx: Ctx, w: number, d: ContextData): RenderElement[] {
  const p = ctx.pal
  const t = totals(d.files)
  const root = d.tracked?.root ?? d.cwd ?? ''
  const entries = d.tracked ? repoEntries(d.tracked.root, d.tracked.paths, d.files) : repoEntries(root, [], d.files)
  const untouched = entries.filter(([, m]) => m === 'untouched').length
  const head = title(ctx, w, 'Files')
  const note: Span[] = [
    { t: ` ${t.read} read`, fg: p.E },
    { t: ' · ', fg: p.D },
    { t: `${t.edited} edited`, fg: p.G },
    { t: ' · ', fg: p.D },
    { t: d.tracked ? `${untouched} untouched` : 'untouched n/a', fg: p.D },
  ]
  const noteW = note.reduce((n, s) => n + len(s.t), 0)
  const headLine: Span[] = [head[0] ?? { t: 'FILES' }, { t: ' ' }, { t: '─'.repeat(Math.max(0, w - 6 - noteW)), fg: p.LN }, ...note]
  const rows: RenderElement[] = [Line(ctx, headLine, 'files-title')]
  if (entries.length === 0) {
    rows.push(Line(ctx, [{ t: 'No file read or edited yet.', fg: p.D, i: true }], 'files-empty'))
    return rows
  }
  const toggled = new Set([...d.expanded].filter(x => x.startsWith('+') || x.startsWith('-')))
  const outside = entries.map(([rel, m]): [string, Mark] => (rel.startsWith('/') ? [`(outside repo)/${rel.split('/').pop() ?? rel}`, m] : [rel, m]))
  const tree = buildTree(root.split('/').pop() || 'files', outside)
  const lines = treeLines(tree, { toggled, untouchedListed: 6, maxLines: 60 })
  for (const l of lines) {
    rows.push(treeRow(ctx, w, l, 'tree-', (path, open) => d.toggle(open ? `-${path}` : `+${path}`)))
  }
  return rows
}

export function context(ctx: Ctx, d: ContextData): RenderElement {
  const w = ctx.width
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  const b = d.breakdown
  const rows: RenderElement[] = []
  if (b === null) {
    rows.push(Line(ctx, title(ctx, w, 'Context', 'not measured yet'), 'ctx-title'))
    rows.push(Line(ctx, [{ t: 'The breakdown appears after the first turn.', fg: p.D, i: true }], 'ctx-empty'))
  } else {
    const compacted = d.compactions > 0 ? ` · ⟲${d.compactions}` : ''
    rows.push(Line(ctx, title(ctx, w, 'Context', `${k1(b.totalTokens)} / ${k(b.rawMaxTokens)} · ${Math.round(b.percentage)}%${compacted}`, p.T), 'ctx-title'))
    rows.push(...barBlock(ctx, w, b))
    rows.push(Line(ctx, [], 'ctx-gap-1'))
    const gridW = (b.grid[0]?.length ?? 0) * 2 - 1
    if (d.showGrid && gridW > 0 && w - gridW - 1 >= 28) {
      rows.push(
        Row(
          ctx,
          [cellsBlock(ctx, 'ctx-grid', gridCells(b, p)), <Box width={2} />, Col(ctx, legendRows(ctx, w - gridW - 2, b, tokensPerSquare(b)), 'legend')],
          'ctx-grid-row',
        ),
      )
    } else if (d.showGrid && gridW > 0) {
      rows.push(cellsBlock(ctx, 'ctx-grid', gridCells(b, p)), ...legendRows(ctx, w, b, tokensPerSquare(b)))
    } else {
      rows.push(...legendRows(ctx, w, b, undefined))
    }
    rows.push(Line(ctx, [], 'ctx-gap-2'))
    const stamp = `${b.detail} · updated ${ago(b.at, ctx.now)}`
    rows.push(
      <Box key="ctx-actions" flexDirection="row" width={w}>
        <Button key="recount" plain onPress={d.recount}>
          <Text color={p.G}>{d.recounting ? '[ Counting… ]' : '[ Precise recount ]'}</Text>
        </Button>
        <Button key="grid" plain onPress={d.toggleGrid}>
          <Text color={p.D}>{d.showGrid ? ' [ Hide grid ]' : ' [ Grid ]'}</Text>
        </Button>
        <Box flexGrow={1} />
        <Text color={p.D} italic>
          {stamp}
        </Text>
      </Box>,
    )
    rows.push(Line(ctx, [], 'ctx-gap-3'))
    rows.push(...sections(ctx, w, d, b))
  }
  rows.push(Line(ctx, [], 'ctx-gap-4'))
  rows.push(...filesBlock(ctx, w, d))
  return (
    <Box key="context" flexDirection="column" width={w}>
      {rows}
    </Box>
  )
}

