/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared test fixtures: the render inputs the engine would pass, and stubs
// for the `$` calls the mod makes, recording what it asked for.

import type { TestBody } from 'claude-code/testing'

type On = Parameters<TestBody>[1]

export const SURFACES = ['terminal', 'desktop'] as const

export function paneInput(placement: 'dock' | 'inline' = 'dock', bodyColumns = 52, bodyRows = 46) {
  return {
    plugin: 'clawd-panel',
    component: 'Pane',
    requestId: 'clawd',
    viewport: { columns: 200, rows: 50, isFullscreen: placement === 'dock' },
    props: {
      title: 'Claude HUD',
      isFocused: true,
      bodyColumns,
      placement,
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  } as const
}

/** A `command.run` input as the person typing it at a fullscreen terminal raises it. */
export function cmd(command: string, args = '') {
  return { command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } } as const
}

export type Recorder = {
  store: Map<string, unknown>
  opened: unknown[]
  closed: unknown[]
  toasts: string[]
  panes: { id: string }[]
}

/** Stubs the UI and store calls every test needs. */
export function stubBasics(on: On): Recorder {
  const rec: Recorder = { store: new Map(), opened: [], closed: [], toasts: [], panes: [] }
  on('store.get', ($, e) => ({ value: rec.store.get(e.key) }))
  on('store.set', ($, e) => {
    rec.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.open', ($, e) => {
    rec.opened.push(e)
    if (!rec.panes.some(p => p.id === e.id)) rec.panes.push({ id: e.id })
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    rec.closed.push(e)
    rec.panes = rec.panes.filter(p => p.id !== e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({
    value: rec.panes.map(p => ({ id: p.id, title: 'Claude HUD', isShown: true, isFocused: true, isPlaced: true })),
  }))
  on('ui.toast', ($, e) => {
    rec.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  return rec
}

export type Fixture = {
  percent: number
  costUsd: number
  rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[]
  agents: { id: string; description: string; type: string; status: 'running' | 'completed'; parentId?: string; name?: string }[]
  git: Record<string, string>
  usageCalls: unknown[]
}

export const GIT_OUT: Record<string, string> = {
  'rev-parse --show-toplevel': '/w\n',
  'status --porcelain=v2 --branch': [
    '# branch.oid 3f9c1e0aaaa',
    '# branch.head feat/hud',
    '# branch.ab +2 -0',
    '1 .M N... 100644 100644 100644 a b src/hud/panel.ts',
    '1 A. N... 000000 100644 100644 0 c src/hud/sprite.ts',
  ].join('\n'),
  'diff --numstat HEAD': '48\t3\tsrc/hud/panel.ts\n88\t0\tsrc/hud/sprite.ts\n',
  'for-each-ref': 'feat/hud\t3f9c1e0\t[ahead 2]\t1000\t*\t/w\nmain\ta81d2c4\t\t900\t \t\nhud/reviewer\t77d1f02\t\t990\t \t/w/.worktrees/reviewer\n',
  log: ['* \u001f3f9c1e0\u001fHEAD -> feat/hud\u001fradar: half-block fill', '* \u001fa81d2c4\u001fmain\u001fci: cache pnpm store'].join('\n'),
  'ls-files -z': 'src/hud/panel.ts\u0000src/hud/sprite.ts\u0000src/hud/theme.ts\u0000src/index.ts\u0000package.json\u0000',
  'rev-parse --show-toplevel --git-dir --abbrev-ref HEAD': '/w/.worktrees/reviewer\n/w/.git/worktrees/reviewer\nhud/reviewer\n',
}

function gitKey(argv: readonly string[]): string {
  const rest = argv.slice(1)
  if (rest[0] === 'log') return 'log'
  if (rest[0] === 'for-each-ref') return 'for-each-ref'
  return rest.join(' ')
}

/** Stubs the session's reads: usage (with a breakdown when asked), model, turns, cwd, agents, git and env. */
export function stubSession(on: On, overrides: Partial<Fixture> = {}): Fixture {
  const fx: Fixture = {
    percent: 71,
    costUsd: 4.82,
    rateLimits: [
      { kind: 'five_hour', percentUsed: 34, resetsAt: '2026-10-11T22:14:00Z' },
      { kind: 'seven_day', percentUsed: 61, resetsAt: '2026-10-15T09:00:00Z' },
    ],
    agents: [],
    git: GIT_OUT,
    usageCalls: [],
    ...overrides,
  }
  on('session.usage', ($, e) => {
    fx.usageCalls.push(e)
    const tokens = Math.round((fx.percent / 100) * 200000)
    const context = {
      tokens,
      window: 200000,
      percent: fx.percent,
      ...(e && 'breakdown' in e && e.breakdown
        ? {
            breakdown: {
              categories: [
                { name: 'System prompt', tokens: 3100, color: 'promptBorder', isDeferred: false, kind: 'used' as const },
                { name: 'System tools', tokens: 14800, color: 'inactive', isDeferred: false, kind: 'used' as const },
                { name: 'MCP tools', tokens: 11600, color: 'cyan_FOR_SUBAGENTS_ONLY', isDeferred: false, kind: 'used' as const },
                { name: 'Memory files', tokens: 2900, color: 'claude', isDeferred: false, kind: 'used' as const },
                { name: 'Messages', tokens: 106000, color: 'permission', isDeferred: false, kind: 'used' as const },
                { name: 'Free space', tokens: 13000, color: 'promptBorder', isDeferred: false, kind: 'free' as const },
                { name: 'Autocompact buffer', tokens: 45000, color: 'inactive', isDeferred: false, kind: 'buffer' as const },
              ],
              totalTokens: tokens,
              maxTokens: 200000,
              rawMaxTokens: 200000,
              autocompactSource: 'auto' as const,
              percentage: fx.percent,
              gridRows: Array.from({ length: 10 }, (_, r) =>
                Array.from({ length: 10 }, (_, c) => ({
                  color: 'permission',
                  isFilled: r * 10 + c < fx.percent,
                  categoryName: r * 10 + c < fx.percent ? 'Messages' : 'Free space',
                  tokens: 0,
                  percentage: 0,
                  squareFullness: 1,
                })),
              ),
              model: 'claude-opus-5-5',
              memoryFiles: [{ path: '/w/CLAUDE.md', type: 'Project', tokens: 1800 }],
              mcpTools: [{ name: 'mcp__github__a', serverName: 'github', tokens: 4200, isLoaded: true }],
              agents: [{ agentType: 'reviewer', source: 'projectSettings', tokens: 400 }],
              skills: { totalSkills: 6, includedSkills: 6, tokens: 2200, skillFrontmatter: [{ name: 'review', source: 'plugin', tokens: 400 }] },
              autoCompactThreshold: 190000,
              isAutoCompactEnabled: true,
              apiUsage: null,
            },
          }
        : {}),
    }
    return { value: { startedAt: Date.parse('2026-10-11T18:18:00Z'), context, rateLimits: fx.rateLimits, cost: { usd: fx.costUsd } } }
  })
  on('session.model', () => ({ value: 'Opus 5.5' }))
  on('session.turns', () => ({ value: 37 }))
  on('session.cwd', () => ({ value: '/w' }))
  on('agent.list', () => ({ value: fx.agents }))
  on('process.run', ($, e) => {
    const out = fx.git[gitKey(e.argv)]
    const r = out === undefined ? { exitCode: 128, stdout: '', stderr: 'fatal' } : { exitCode: 0, stdout: out, stderr: '' }
    return { value: { ...r, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('session.start', () => ({ cwd: '/w' }))
  return fx
}

/**
 * A plugin loaded beside the mod in a test, answering `/peek <key>` with the
 * mod's `$.state` value as JSON: the test's own `$` has no `state` noun. The
 * kit scans it as a module, so each key is a literal reference.
 */
export const PEEK = {
  name: 'peek',
  register(on: any) {
    on('command.run', { command: 'peek' }, async ($: any, e: any) => {
        if (e.args === 'tab') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'tab' })).value ?? null) }
        if (e.args === 'expanded') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'expanded' })).value ?? null) }
        if (e.args === 'showGrid') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'showGrid' })).value ?? null) }
        if (e.args === 'band') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'band' })).value ?? null) }
        if (e.args === 'now') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'now' })).value ?? null) }
        if (e.args === 'usage') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'usage' })).value ?? null) }
        if (e.args === 'breakdown') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'breakdown' })).value ?? null) }
        if (e.args === 'recounting') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'recounting' })).value ?? null) }
        if (e.args === 'session') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'session' })).value ?? null) }
        if (e.args === 'mainTokens') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'mainTokens' })).value ?? null) }
        if (e.args === 'cost') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'cost' })).value ?? null) }
        if (e.args === 'agents') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'agents' })).value ?? null) }
        if (e.args === 'files') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'files' })).value ?? null) }
        if (e.args === 'tracked') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'tracked' })).value ?? null) }
        if (e.args === 'git') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'git' })).value ?? null) }
        if (e.args === 'alert') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'alert' })).value ?? null) }
        if (e.args === 'avatar') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'avatar' })).value ?? null) }
        if (e.args === 'avatarState') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'avatarState' })).value ?? null) }
        if (e.args === 'avatarFrames') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'avatarFrames' })).value ?? null) }
        if (e.args === 'previewing') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'previewing' })).value ?? null) }
        if (e.args === 'avatarNote') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'avatarNote' })).value ?? null) }
        if (e.args === 'lifetimeTurns') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'lifetimeTurns' })).value ?? null) }
        if (e.args === 'terminal') return { text: JSON.stringify((await $.state.get({ plugin: 'clawd-panel', key: 'terminal' })).value ?? null) }
        return { text: 'null' }
    })
  },
}

export const WITH_PEEK = { plugins: [PEEK] } as never

/** Reads one of the mod's `$.state` values from a test. */
export async function state($: Parameters<TestBody>[0], key: string): Promise<unknown> {
  const r = await $.command.run(cmd('peek', key))
  return JSON.parse(r.text ?? 'null')
}
