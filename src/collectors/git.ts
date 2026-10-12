// Git: the commands the engine runs (by argv, no shell) and parsers for what
// they print. Pure. The engine runs them in the session's directory, or in a
// subagent's `cwd`.

import type { GitBranch, GitChange, GitLogLine, GitSnap } from '../../types'

export const ARGV = {
  toplevel: ['git', 'rev-parse', '--show-toplevel'],
  status: ['git', 'status', '--porcelain=v2', '--branch'],
  numstat: ['git', 'diff', '--numstat', 'HEAD'],
  branches: [
    'git',
    'for-each-ref',
    '--sort=-committerdate',
    '--format=%(refname:short)%09%(objectname:short)%09%(upstream:track)%09%(committerdate:unix)%09%(HEAD)%09%(worktreepath)',
    'refs/heads',
  ],
  log: ['git', 'log', '--graph', '--all', '--date-order', '--decorate=short', '--format=%x1f%h%x1f%D%x1f%s', '-n', '13'],
  files: ['git', 'ls-files', '-z'],
} as const

/** Tracked paths the Context tab's tree takes at most. */
export const MAX_TRACKED = 20000

export type Status = {
  branch?: string
  head?: string
  ahead?: number
  behind?: number
  modified: number
  staged: number
  untracked: number
  changes: GitChange[]
}

/** Reads `git status --porcelain=v2 --branch`. */
export function parseStatus(stdout: string): Status {
  const s: Status = { modified: 0, staged: 0, untracked: 0, changes: [] }
  for (const line of stdout.split('\n')) {
    if (line.startsWith('# branch.head ')) {
      const head = line.slice('# branch.head '.length)
      if (head !== '(detached)') s.branch = head
    } else if (line.startsWith('# branch.oid ')) {
      const oid = line.slice('# branch.oid '.length)
      if (oid !== '(initial)') s.head = oid.slice(0, 7)
    } else if (line.startsWith('# branch.ab ')) {
      const m = /\+(\d+) -(\d+)/.exec(line)
      if (m) {
        s.ahead = Number(m[1])
        s.behind = Number(m[2])
      }
    } else if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('u ')) {
      const fields = line.split(' ')
      const xy = fields[1] ?? '..'
      const x = xy[0] ?? '.'
      const y = xy[1] ?? '.'
      if (x !== '.') s.staged += 1
      if (y !== '.') s.modified += 1
      const skip = line.startsWith('1 ') ? 8 : line.startsWith('2 ') ? 9 : 10
      const rest = fields.slice(skip).join(' ')
      const path = rest.split('\t')[0] ?? rest
      s.changes.push({ code: line.startsWith('u ') ? 'U' : x !== '.' ? x : y, path })
    } else if (line.startsWith('? ')) {
      s.untracked += 1
      s.changes.push({ code: '?', path: line.slice(2) })
    }
  }
  return s
}

/** Reads `git diff --numstat HEAD`: lines added and removed per path (binary files have none). */
export function parseNumstat(stdout: string): Map<string, { added: number; removed: number }> {
  const out = new Map<string, { added: number; removed: number }>()
  for (const line of stdout.split('\n')) {
    const [a, r, ...rest] = line.split('\t')
    if (rest.length === 0 || a === undefined || r === undefined || a === '-') continue
    out.set(rest.join('\t'), { added: Number(a), removed: Number(r) })
  }
  return out
}

export function withNumstat(changes: readonly GitChange[], numstat: Map<string, { added: number; removed: number }>): GitChange[] {
  return changes.map(c => {
    const n = numstat.get(c.path)
    return n ? { ...c, added: n.added, removed: n.removed } : c
  })
}

/** Reads the `for-each-ref` line format in ARGV.branches. `root` is the main worktree's folder. */
export function parseBranches(stdout: string, nowSeconds: number, root: string): GitBranch[] {
  const out: GitBranch[] = []
  for (const line of stdout.split('\n')) {
    if (line.trim() === '') continue
    const [name = '', head = '', track = '', date = '0', mark = '', worktreePath = ''] = line.split('\t')
    const b: GitBranch = {
      name,
      head,
      track: trackShort(track),
      ageSeconds: Math.max(0, nowSeconds - Number(date)),
      isCurrent: mark === '*',
    }
    if (worktreePath !== '' && worktreePath !== root) b.worktree = worktreePath.split('/').pop() ?? worktreePath
    out.push(b)
  }
  return out
}

/** `[ahead 2, behind 1]` as `↑2 ↓1`; `[gone]` as `gone`. */
export function trackShort(track: string): string {
  if (track.includes('gone')) return 'gone'
  const ahead = /ahead (\d+)/.exec(track)
  const behind = /behind (\d+)/.exec(track)
  return [ahead ? `↑${ahead[1]}` : '', behind ? `↓${behind[1]}` : ''].filter(Boolean).join(' ')
}

/** Reads `git log --graph` in the ARGV.log format: graph guides, then hash, refs and subject. */
export function parseLog(stdout: string): GitLogLine[] {
  const out: GitLogLine[] = []
  for (const raw of stdout.split('\n')) {
    if (raw === '') continue
    const [graph = '', hash, refs, ...subject] = raw.split('\u001f')
    if (hash === undefined) {
      out.push({ graph: graph.trimEnd() })
      continue
    }
    const line: GitLogLine = { graph: graph.trimEnd(), hash }
    if (refs) line.refs = refs
    line.subject = subject.join('\u001f')
    out.push(line)
  }
  return out
}

/** Reads `git ls-files -z`. */
export function parseFiles(stdout: string): string[] {
  return stdout.split('\u0000').filter(p => p !== '').slice(0, MAX_TRACKED)
}

/** The first ref of a decoration that names a branch (`HEAD -> main, origin/main` gives `main`). */
export function firstRef(refs: string | undefined): string | undefined {
  if (!refs) return undefined
  const first = refs.split(', ')[0] ?? ''
  return first.startsWith('HEAD -> ') ? first.slice('HEAD -> '.length) : first.replace(/^tag: /, '')
}

/** `git log --graph`'s guides in the box-drawing glyphs the mockup draws. */
export function graphGlyphs(graph: string): string {
  return graph.replace(/\*/g, '●').replace(/\|/g, '│').replace(/\//g, '╯').replace(/\\/g, '╮').replace(/_/g, '─')
}

/** Seconds as the shortest unit that fits: `45s`, `2m`, `3h`, `4d`, `5w`. */
export function age(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  if (seconds < 86400 * 14) return `${Math.floor(seconds / 86400)}d`
  return `${Math.floor(seconds / (86400 * 7))}w`
}

export function emptyGit(at: number, error?: string): GitSnap {
  const s: GitSnap = { at, isRepo: false, modified: 0, staged: 0, untracked: 0, changes: [], branches: [], worktrees: 0, log: [] }
  if (error !== undefined) s.error = error
  return s
}
