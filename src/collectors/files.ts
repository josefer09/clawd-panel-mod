// Files the session consumed: every path a Read, Edit, Write or NotebookEdit
// call named (Grep, Glob and Bash are searches and commands, not consumption,
// and are not counted), against the repository's tracked files for the
// untouched ones. Pure. Tokens per file are not exposed by the engine and are
// not shown.

import type { FileMark } from '../../types'

export type Files = Record<string, FileMark>

export type Mark = 'read' | 'edited' | 'untouched'

/** The tools whose calls count as reading or editing a file. */
export const FILE_TOOLS = ['Read', 'Edit', 'Write', 'NotebookEdit'] as const

/** The file a file tool's call names, and whether it reads or edits it. */
export function fileOf(tool: string, input: Record<string, unknown>): { path: string; kind: 'read' | 'edited' } | undefined {
  const path = tool === 'NotebookEdit' ? input.notebook_path : input.file_path
  if (typeof path !== 'string' || path === '') return undefined
  return { path, kind: tool === 'Read' ? 'read' : 'edited' }
}

/** Records one consumption of a file; `agentId` is '' for the main conversation. */
export function markFile(files: Files, path: string, kind: 'read' | 'edited', agentId: string): Files {
  const before = files[path] ?? { read: false, edited: false, agents: [] }
  const mark: FileMark = {
    read: before.read || kind === 'read',
    edited: before.edited || kind === 'edited',
    agents: before.agents.includes(agentId) ? before.agents : [...before.agents, agentId],
  }
  return { ...files, [path]: mark }
}

export function markOf(mark: FileMark | undefined): Mark {
  if (mark === undefined) return 'untouched'
  return mark.edited ? 'edited' : 'read'
}

/** `path` relative to `root` when inside it, else unchanged. */
export function relative(root: string, path: string): string {
  const base = root.endsWith('/') ? root : root + '/'
  return path.startsWith(base) ? path.slice(base.length) : path
}

export type Counts = { read: number; edited: number; untouched: number }

export type TreeNode = {
  name: string
  /** Path from the tree's root, `/`-separated; '' for the root. */
  path: string
  dirs: Map<string, TreeNode>
  files: Map<string, Mark>
  counts: Counts
}

function node(name: string, path: string): TreeNode {
  return { name, path, dirs: new Map(), files: new Map(), counts: { read: 0, edited: 0, untouched: 0 } }
}

/** Builds the tree of `entries` (relative paths and their marks), counting each directory's files by mark. */
export function buildTree(rootName: string, entries: Iterable<[string, Mark]>): TreeNode {
  const root = node(rootName, '')
  for (const [rel, mark] of entries) {
    const parts = rel.split('/').filter(p => p !== '')
    if (parts.length === 0) continue
    let at = root
    root.counts[mark] += 1
    for (const dir of parts.slice(0, -1)) {
      const path = at.path === '' ? dir : `${at.path}/${dir}`
      let next = at.dirs.get(dir)
      if (next === undefined) {
        next = node(dir, path)
        at.dirs.set(dir, next)
      }
      next.counts[mark] += 1
      at = next
    }
    at.files.set(parts[parts.length - 1] as string, mark)
  }
  return root
}

/** The session's files against the tracked ones: every tracked path, plus each touched path. */
export function repoEntries(root: string, tracked: readonly string[], files: Files): [string, Mark][] {
  const out = new Map<string, Mark>()
  for (const p of tracked) out.set(p, 'untouched')
  for (const [abs, mark] of Object.entries(files)) out.set(relative(root, abs), markOf(mark))
  return [...out.entries()]
}

export function totals(files: Files): { read: number; edited: number } {
  let read = 0
  let edited = 0
  for (const m of Object.values(files)) {
    if (m.edited) edited += 1
    else if (m.read) read += 1
  }
  return { read, edited }
}

export type TreeLine = {
  /** The guide drawn before the glyph: `├── `, `│   └── `, ... */
  prefix: string
  kind: 'dir' | 'file' | 'more'
  name: string
  /** A directory's path, for its toggle. */
  path?: string
  isOpen?: boolean
  mark?: Mark
  /** A collapsed directory's counts. */
  counts?: Counts
}

export type TreeOptions = {
  /** Directories the person opened or closed by hand: `+path` open, `-path` closed. */
  toggled: ReadonlySet<string>
  /** Untouched files listed one by one in an open directory before they fold into one row. */
  untouchedListed: number
  /** Lines at most. */
  maxLines: number
}

function hasTouched(n: TreeNode): boolean {
  return n.counts.read + n.counts.edited > 0
}

export function isOpen(n: TreeNode, toggled: ReadonlySet<string>): boolean {
  if (toggled.has(`+${n.path}`)) return true
  if (toggled.has(`-${n.path}`)) return false
  return hasTouched(n)
}

/**
 * The tree as rows: the root open, each directory open while it holds a
 * touched file (or the person opened it), collapsed ones with their counts,
 * untouched files of an open directory folded past `untouchedListed`.
 */
export function treeLines(root: TreeNode, opts: TreeOptions): TreeLine[] {
  const out: TreeLine[] = [{ prefix: '', kind: 'dir', name: root.name + '/', path: root.path, isOpen: true }]
  const walk = (n: TreeNode, guide: string) => {
    const dirs = [...n.dirs.values()].sort((a, z) => a.name.localeCompare(z.name))
    const fileNames = [...n.files.entries()].sort((a, z) => a[0].localeCompare(z[0]))
    const touchedFiles = fileNames.filter(([, m]) => m !== 'untouched')
    const untouchedFiles = fileNames.filter(([, m]) => m === 'untouched')
    const listedUntouched = untouchedFiles.length <= opts.untouchedListed + 1 ? untouchedFiles : untouchedFiles.slice(0, opts.untouchedListed)
    const folded = untouchedFiles.length - listedUntouched.length
    const rows: (() => TreeLine & { child?: TreeNode })[] = []
    for (const d of dirs) {
      const open = isOpen(d, opts.toggled)
      rows.push(() => ({ prefix: '', kind: 'dir', name: d.name + '/', path: d.path, isOpen: open, counts: d.counts, child: open ? d : undefined }))
    }
    for (const [name, mark] of [...touchedFiles, ...listedUntouched].sort((a, z) => a[0].localeCompare(z[0]))) {
      rows.push(() => ({ prefix: '', kind: 'file', name, mark }))
    }
    if (folded > 0) rows.push(() => ({ prefix: '', kind: 'more', name: `${folded} more untouched`, mark: 'untouched' }))
    rows.forEach((make, i) => {
      const last = i === rows.length - 1
      const line = make()
      const { child, ...rest } = line
      out.push({ ...rest, prefix: guide + (last ? '└── ' : '├── ') })
      if (child) walk(child, guide + (last ? '    ' : '│   '))
    })
  }
  walk(root, '')
  if (out.length <= opts.maxLines) return out
  const kept = out.slice(0, Math.max(1, opts.maxLines - 1))
  kept.push({ prefix: '', kind: 'more', name: `${out.length - kept.length} more rows`, mark: 'untouched' })
  return kept
}

/** The longest directory every path shares, `/`-separated, '' when none. */
export function commonDir(paths: readonly string[]): string {
  if (paths.length === 0) return ''
  const split = paths.map(p => p.split('/').slice(0, -1))
  const first = split[0] ?? []
  let n = first.length
  for (const parts of split) {
    let i = 0
    while (i < n && parts[i] === first[i]) i += 1
    n = i
  }
  return first.slice(0, n).join('/')
}
