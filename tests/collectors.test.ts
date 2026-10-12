import { expect, test } from 'claude-code/testing'

import { completed, listed, ordered, parseLocation, spawned, stepped } from '../src/collectors/agents'
import { reduceBreakdown, tokensPerSquare } from '../src/collectors/context'
import { buildTree, commonDir, fileOf, markFile, repoEntries, totals, treeLines } from '../src/collectors/files'
import { age, graphGlyphs, parseBranches, parseFiles, parseLog, parseNumstat, parseStatus, trackShort, withNumstat } from '../src/collectors/git'
import { addStep, alertStep, baselineCost, cacheHit, outIn, recordCost, snapshotUsage } from '../src/collectors/session'
import { detectTerminal } from '../src/collectors/terminal'
import { EMPTY_TOKENS } from '../src/state'

const USAGE = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, model: 'claude-opus-5-5' }

test('usage snapshots keep what the engine reported and leave out what it did not', () => {
  const snap = snapshotUsage(
    { context: { window: 200000 }, rateLimits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-11T20:00:00Z' }] },
    5,
    1,
  )
  expect(snap).toEqual({
    at: 5,
    startedAt: 1,
    contextWindow: 200000,
    rateLimits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-11T20:00:00Z' }],
  })
  const full = snapshotUsage({ context: { window: 200000, tokens: 142000, percent: 71 }, rateLimits: [], cost: { usd: 4.82 } }, 5, 1)
  expect(full.contextTokens).toBe(142000)
  expect(full.contextPercent).toBe(71)
  expect(full.costUsd).toBe(4.82)
})

test('steps add up, and cache hit and out/in are ratios of reported tokens', () => {
  const t = addStep(addStep(EMPTY_TOKENS, USAGE), null)
  expect(t).toEqual({ input: 100, output: 40, cacheRead: 800, cacheWrite: 100, requests: 1 })
  expect(cacheHit(t)).toBe(0.8)
  expect(outIn(t)).toBe(0.04)
  expect(cacheHit(EMPTY_TOKENS)).toBeUndefined()
})

test('per-turn cost is the growth of the session ledger', () => {
  let ledger = baselineCost({ turns: [] }, 1.5)
  ledger = recordCost(ledger, 1.75)
  ledger = recordCost(ledger, 2.0)
  ledger = recordCost(ledger, undefined)
  expect(ledger.turns).toEqual([0.25, 0.25])
  expect(ledger.lastTotal).toBe(2.0)
})

test('the context alert toasts once per crossing', () => {
  let a = { crossed: false, dismissed: false }
  const s1 = alertStep(a, 91, 90)
  expect(s1.toast).toBe(true)
  a = s1.next
  expect(alertStep(a, 93, 90).toast).toBe(false)
  a = alertStep(a, 50, 90).next
  expect(a.crossed).toBe(false)
  expect(alertStep(a, 90, 90).toast).toBe(true)
})

test('the breakdown groups MCP tools by server and keeps the grid', () => {
  const b = reduceBreakdown(
    {
      categories: [
        { name: 'Messages', tokens: 106000, color: 'permission', isDeferred: false, kind: 'used' },
        { name: 'Free space', tokens: 13000, color: 'inactive', isDeferred: false, kind: 'free' },
      ],
      totalTokens: 142000,
      maxTokens: 200000,
      rawMaxTokens: 200000,
      autocompactSource: 'auto',
      percentage: 71,
      gridRows: [[{ color: 'permission', isFilled: true, categoryName: 'Messages', tokens: 106000, percentage: 53, squareFullness: 1 }]],
      model: 'claude-opus-5-5',
      memoryFiles: [{ path: '/w/CLAUDE.md', type: 'Project', tokens: 1800 }],
      mcpTools: [
        { name: 'mcp__github__a', serverName: 'github', tokens: 3000, isLoaded: true },
        { name: 'mcp__github__b', serverName: 'github', tokens: 1200, isLoaded: true },
        { name: 'mcp__linear__a', serverName: 'linear', tokens: 900, isLoaded: false },
      ],
      agents: [{ agentType: 'reviewer', source: 'projectSettings', tokens: 400 }],
      isAutoCompactEnabled: true,
      apiUsage: null,
    },
    'summary',
    7,
  )
  expect(b.mcpServers).toEqual([
    {
      name: 'github',
      tokens: 4200,
      tools: 2,
      loaded: 2,
      items: [
        { name: 'a', tokens: 3000, isLoaded: true },
        { name: 'b', tokens: 1200, isLoaded: true },
      ],
    },
    { name: 'linear', tokens: 0, tools: 1, loaded: 0, items: [{ name: 'a', tokens: 900, isLoaded: false }] },
  ])
  expect(b.grid[0]?.[0]).toEqual({ categoryName: 'Messages', isFilled: true, fullness: 1 })
  expect(tokensPerSquare(b)).toBe(200000)
  expect(b.skills).toBe(null)
})

test('agents: spawn, steps, the engine list and completion', () => {
  let a = spawned(
    {},
    {
      tool_use_id: 'tu',
      prompt: 'Review src/',
      description: 'Review render loop',
      subagentType: 'general-purpose',
      provider: { plugin: 'engine', tier: 'core' },
      parentModel: 'claude-opus-5-5',
      background: true,
      fork: false,
      name: 'reviewer',
      cwd: '/w/.worktrees/reviewer',
    },
    { model: 'claude-sonnet-5-5', agentId: 'a1' },
    1000,
  )
  a = stepped(a, 'a1', USAGE, 'high', 1100)
  expect(a.a1?.tokens.requests).toBe(1)
  expect(a.a1?.lastContext).toBe(1000)
  expect(a.a1?.effort).toBe('high')
  a = listed(a, [{ id: 'a2', description: 'Map calls', type: 'Explore', status: 'running', parentId: 'a1' }], 1200)
  expect(ordered(a).map(x => [x.rec.id, x.depth])).toEqual([
    ['a1', 0],
    ['a2', 1],
  ])
  a = completed(a, 'a1', 2000, false)
  expect(a.a1?.status).toBe('completed')
  expect(a.a1?.endedAt).toBe(2000)
})

test('a subagent cwd in a linked worktree is named by its folder', () => {
  expect(parseLocation('/w/.worktrees/reviewer\n/w/.git/worktrees/reviewer\nhud/reviewer\n')).toEqual({
    branch: 'hud/reviewer',
    worktree: 'reviewer',
  })
  expect(parseLocation('/w\n.git\nmain\n')).toEqual({ branch: 'main' })
})

test('files: the four file tools count, the rest do not', () => {
  expect(fileOf('Read', { file_path: '/w/a.ts' })).toEqual({ path: '/w/a.ts', kind: 'read' })
  expect(fileOf('NotebookEdit', { notebook_path: '/w/n.ipynb' })).toEqual({ path: '/w/n.ipynb', kind: 'edited' })
  expect(fileOf('Grep', { pattern: 'x' })).toBeUndefined()
  let f = markFile({}, '/w/src/a.ts', 'read', '')
  f = markFile(f, '/w/src/a.ts', 'edited', 'a1')
  f = markFile(f, '/w/src/b.ts', 'read', '')
  expect(f['/w/src/a.ts']).toEqual({ read: true, edited: true, agents: ['', 'a1'] })
  expect(totals(f)).toEqual({ read: 1, edited: 1 })
})

test('the files tree opens touched folders and counts the closed ones', () => {
  const f = markFile(markFile({}, '/w/src/hud/panel.ts', 'edited', ''), '/w/src/index.ts', 'read', '')
  const tree = buildTree('w', repoEntries('/w', ['src/hud/panel.ts', 'src/hud/theme.ts', 'src/index.ts', 'test/a.ts', 'test/b.ts', 'package.json'], f))
  const lines = treeLines(tree, { toggled: new Set(), untouchedListed: 6, maxLines: 40 })
  expect(lines.map(l => `${l.prefix}${l.name}`)).toEqual([
    'w/',
    '├── src/',
    '│   ├── hud/',
    '│   │   ├── panel.ts',
    '│   │   └── theme.ts',
    '│   └── index.ts',
    '├── test/',
    '└── package.json',
  ])
  expect(lines[6]?.counts).toEqual({ read: 0, edited: 0, untouched: 2 })
  expect(lines[6]?.isOpen).toBe(false)
  expect(commonDir(['src/hud/a.ts', 'src/hud/b.ts', 'src/x.ts'])).toBe('src')
})

test('git status, numstat, branches, log and files parse', () => {
  const status = parseStatus(
    [
      '# branch.oid 3f9c1e0aa',
      '# branch.head feat/hud',
      '# branch.upstream origin/feat/hud',
      '# branch.ab +2 -0',
      '1 .M N... 100644 100644 100644 aaa bbb src/hud/panel.ts',
      '1 A. N... 000000 100644 100644 000 ccc src/hud/sprite.ts',
      '2 R. N... 100644 100644 100644 ddd eee R100 src/new name.ts\tsrc/old.ts',
      '? scratch.txt',
    ].join('\n'),
  )
  expect(status.branch).toBe('feat/hud')
  expect(status.head).toBe('3f9c1e0')
  expect([status.ahead, status.behind]).toEqual([2, 0])
  expect([status.modified, status.staged, status.untracked]).toEqual([1, 2, 1])
  expect(status.changes.map(c => `${c.code} ${c.path}`)).toEqual(['M src/hud/panel.ts', 'A src/hud/sprite.ts', 'R src/new name.ts', '? scratch.txt'])
  const changes = withNumstat(status.changes, parseNumstat('48\t3\tsrc/hud/panel.ts\n-\t-\timg.png\n'))
  expect(changes[0]).toEqual({ code: 'M', path: 'src/hud/panel.ts', added: 48, removed: 3 })
  const branches = parseBranches('feat/hud\t3f9c1e0\t[ahead 2]\t1000\t*\t/w\nhud/reviewer\t77d1f02\t\t940\t \t/w/.worktrees/reviewer\n', 1120, '/w')
  expect(branches[0]).toEqual({ name: 'feat/hud', head: '3f9c1e0', track: '↑2', ageSeconds: 120, isCurrent: true })
  expect(branches[1]?.worktree).toBe('reviewer')
  expect(trackShort('[ahead 2, behind 3]')).toBe('↑2 ↓3')
  const log = parseLog('* \u001f3f9c1e0\u001fHEAD -> feat/hud\u001fradar: half-block fill\n|\\  \n')
  expect(log).toEqual([{ graph: '*', hash: '3f9c1e0', refs: 'HEAD -> feat/hud', subject: 'radar: half-block fill' }, { graph: '|\\' }])
  expect(graphGlyphs('|\\')).toBe('├─╮')
  expect(graphGlyphs('|/  ')).toBe('├─╯ ')
  expect(graphGlyphs('| * ')).toBe('│ ● ')
  expect(parseFiles('a.ts\u0000b/c.ts\u0000')).toEqual(['a.ts', 'b/c.ts'])
  expect(age(125)).toBe('2m')
  expect(age(86400 * 3)).toBe('3d')
})

test('the terminal decides whether an Image draws pixels', () => {
  expect(detectTerminal({ TERM_PROGRAM: 'ghostty' })).toEqual({ name: 'ghostty', images: true })
  expect(detectTerminal({ TERM: 'xterm-kitty', TMUX: '/tmp/t' })).toEqual({ name: 'kitty in tmux', images: false })
  expect(detectTerminal({ TERM_PROGRAM: 'iTerm.app' })).toEqual({ name: 'iTerm2', images: false })
  expect(detectTerminal({ TERM_PROGRAM: 'WezTerm', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: '1' }).images).toBe(true)
})
