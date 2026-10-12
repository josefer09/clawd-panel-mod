// Git (board 1e): the current branch with ahead/behind, head and dirty
// counts, the changed files with lines added and removed, local branches
// (subagent worktrees marked), and the commit graph.

import type { RenderElement } from 'claude-code'

import type { GitSnap } from '../../../types'
import { age, firstRef, graphGlyphs } from '../../collectors/git'
import type { Palette } from '../../theme'
import { ago } from '../format'
import { clip, len, Line, pad, spread, title } from '../ui'
import type { Ctx, Span } from '../ui'

export type GitData = {
  git: GitSnap | null
  /** Branch names a running subagent's worktree is on. */
  agentBranches: ReadonlySet<string>
  refresh: () => void
}

/** Branch colors in order, the current branch first, as the mockup colors them. */
function branchColor(i: number, p: Palette): string {
  return [p.R, p.G, p.M, p.E, p.T][i % 5] ?? p.T
}

/** Lane colors for the graph, left to right. */
function laneColor(i: number, p: Palette): string {
  return [p.R, p.M, p.E, p.G, p.T][i % 5] ?? p.T
}

const MAX_CHANGES = 8

function codeColor(code: string, p: Palette): string {
  if (code === 'A' || code === '?') return p.E
  if (code === 'D') return p.M
  if (code === 'U') return p.R
  return p.G
}

function titleWithRefresh(ctx: Ctx, w: number, d: GitData, note: string): RenderElement {
  const p = ctx.pal
  const { Box, Button, Text } = ctx.el
  const label = '[ Refresh ]'
  const head: Span[] = [{ t: 'GIT', fg: p.R, b: true }, { t: ' ' }, { t: '─'.repeat(Math.max(0, w - 4 - len(label) - 1 - len(note) - (note ? 1 : 0))), fg: p.LN }, ...(note ? [{ t: ' ' + note, fg: p.D }] : []), { t: ' ' }]
  return (
    <Box key="git-title" flexDirection="row" width={w}>
      {Line(ctx, head)}
      <Button key="git-refresh" plain onPress={d.refresh}>
        <Text color={p.G}>{label}</Text>
      </Button>
    </Box>
  )
}

export function gitTab(ctx: Ctx, d: GitData): RenderElement {
  const w = ctx.width
  const p = ctx.pal
  const { Box } = ctx.el
  const g = d.git
  const rows: RenderElement[] = []
  if (g === null || !g.isRepo) {
    rows.push(titleWithRefresh(ctx, w, d, ''))
    rows.push(Line(ctx, [], 'git-gap'))
    rows.push(Line(ctx, [{ t: g === null ? 'Reading git…' : 'Not a git repository.', fg: p.D, i: true }], 'git-none'))
    return (
      <Box key="git" flexDirection="column" width={w}>
        {rows}
      </Box>
    )
  }
  rows.push(titleWithRefresh(ctx, w, d, ago(g.at, ctx.now)))
  rows.push(Line(ctx, [], 'git-gap-1'))
  const head: Span[] = [
    { t: '⎇ ', fg: p.E },
    { t: g.branch ?? '(detached)', fg: p.R, b: true },
    ...(g.ahead !== undefined ? [{ t: `  ↑${g.ahead}`, fg: p.E, b: true }, { t: ` ↓${g.behind ?? 0}`, fg: p.D }] : [{ t: '  no upstream', fg: p.D }]),
  ]
  rows.push(Line(ctx, spread(w, head, [{ t: g.head ?? '—', fg: p.D }]), 'git-head'))
  rows.push(Line(ctx, [{ t: `${g.modified} modified · ${g.staged} staged · ${g.untracked} untracked`, fg: p.D }], 'git-counts'))
  rows.push(Line(ctx, [], 'git-gap-2'))
  if (g.changes.length === 0) {
    rows.push(Line(ctx, [pad(1), { t: 'Working tree clean.', fg: p.D, i: true }], 'git-clean'))
  } else {
    for (const c of g.changes.slice(0, MAX_CHANGES)) {
      const right: Span[] = [
        ...(c.added !== undefined ? [{ t: `+${c.added}`, fg: p.E }] : []),
        ...(c.removed !== undefined && c.removed > 0 ? [{ t: ` −${c.removed}`, fg: p.M }] : []),
      ]
      rows.push(Line(ctx, spread(w, [pad(1), { t: c.code, fg: codeColor(c.code, p), b: true }, { t: '  ' + c.path }], right), `git-change-${c.path}`))
    }
    if (g.changes.length > MAX_CHANGES) rows.push(Line(ctx, [pad(1), { t: `… ${g.changes.length - MAX_CHANGES} more`, fg: p.D, i: true }], 'git-more'))
  }
  rows.push(Line(ctx, [], 'git-gap-3'))
  rows.push(Line(ctx, title(ctx, w, 'Branches', `${g.branches.length} local · ${g.worktrees} worktree${g.worktrees === 1 ? '' : 's'}`), 'git-branches-title'))
  const colorOf = new Map<string, string>()
  const ordered = [...g.branches].sort((a, z) => Number(z.isCurrent) - Number(a.isCurrent))
  ordered.forEach((b, i) => colorOf.set(b.name, branchColor(i, p)))
  ordered.slice(0, 8).forEach(b => {
    const name: Span[] = [{ t: (b.isCurrent ? '●' : ' ') + ' ', fg: p.E }, { t: b.name, fg: colorOf.get(b.name) ?? p.T, b: b.isCurrent }]
    const nameW = Math.max(19, Math.min(26, w - 33))
    const marks: Span[] = b.worktree ? [{ t: `▣ ${b.worktree}`, fg: p.G }] : d.agentBranches.has(b.name) ? [{ t: '▣ agent', fg: p.G }] : []
    const line: Span[] = [
      ...clip(name, nameW - 1),
      pad(nameW - name.reduce((n, s) => n + len(s.t), 0)),
      ...clip(marks, 11),
      pad(12 - marks.reduce((n, s) => n + Math.min(11, len(s.t)), 0)),
      { t: b.track.padEnd(7), fg: p.D },
      { t: b.head, fg: p.D },
    ]
    const spans = spread(w, line, [{ t: age(b.ageSeconds), fg: p.D }]).map(s => (b.isCurrent ? { ...s, bg: s.bg ?? p.TR } : s))
    rows.push(Line(ctx, spans, `git-branch-${b.name}`))
  })
  if (g.branches.length > 8) rows.push(Line(ctx, [pad(2), { t: `… ${g.branches.length - 8} more`, fg: p.D, i: true }], 'git-branches-more'))
  rows.push(Line(ctx, [], 'git-gap-4'))
  rows.push(Line(ctx, title(ctx, w, 'Log', `--graph · ${g.log.length} rows`), 'git-log-title'))
  const gw = Math.min(12, Math.max(7, ...g.log.map(l => len(l.graph) + 1)))
  g.log.forEach((l, i) => {
    const graph: Span[] = Array.from(graphGlyphs(l.graph)).map((ch, x) => ({ t: ch, fg: laneColor(Math.floor(x / 2), p), b: ch === '●' }))
    const line: Span[] = [...graph, pad(gw - len(l.graph))]
    if (l.hash) {
      const ref = firstRef(l.refs)
      line.push({ t: l.hash + ' ', fg: p.D })
      const body: Span[] = [...(ref ? [{ t: `(${ref}) `, fg: colorOf.get(ref) ?? p.G, b: true }] : []), { t: l.subject ?? '' }]
      line.push(...clip(body, w - gw - len(l.hash) - 1))
    }
    rows.push(Line(ctx, line, `git-log-${i}`))
  })
  return (
    <Box key="git" flexDirection="column" width={w}>
      {rows}
    </Box>
  )
}
