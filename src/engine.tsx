// Every hook of the mod and every `$` call it makes. The engine's scanner
// follows `$` only into functions declared in the file that uses it, so the
// I/O lives here; what to do with the answers lives in src/collectors (pure)
// and what to draw in src/render (pure).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, HookOf, RenderElement, RenderInput, RenderSurface, Timer } from 'claude-code'

import type { AvatarState, GitSnap, RenderMode, SessionSnap, TabId } from '../types'
import { completed, isActive, listed, located, LOCATION_ARGV, parseLocation, spawned, stepped } from './collectors/agents'
import { GRID_COLUMNS, reduceBreakdown } from './collectors/context'
import { FILE_TOOLS, fileOf, markFile } from './collectors/files'
import { ARGV, emptyGit, parseBranches, parseFiles, parseLog, parseNumstat, parseStatus, withNumstat } from './collectors/git'
import { addStep, alertStep, alertText, baselineCost, effortWord, recordCost, snapshotUsage } from './collectors/session'
import { detectTerminal, parseTerminalWord, terminalWord } from './collectors/terminal'
import type { TerminalEnv } from './collectors/terminal'
import { config, VERSION } from './config'
import { bodyWidth, pane, placeholder } from './render/draw'
import { isTab } from './render/pane'
import { picture } from './render/avatar'
import type { Drawn } from './render/avatar'
import { framePixels, levelOf } from './render/avatarFrames'
import { STATE_TEXT } from './render/raster/sprite'
import { context } from './render/tabs/context'
import type { ContextData } from './render/tabs/context'
import { home } from './render/tabs/home'
import type { HomeData } from './render/tabs/home'
import { elementsOf } from './render/ui'
import type { Ctx } from './render/ui'
import { DEFAULT_AVATAR, DEFAULT_SESSION, EMPTY_TOKENS, isAvatarConfig, PANE, STORE } from './state'
import { paletteOf } from './theme'

// ---------------------------------------------------------------------------
// State: every value a drawing reads (types/index.d.ts declares them)

const tab = atom({ plugin: 'clawd-panel', key: 'tab' } as const, 'home')
const expanded = atom({ plugin: 'clawd-panel', key: 'expanded' } as const, [])
const showGrid = atom({ plugin: 'clawd-panel', key: 'showGrid' } as const, true)
const band = atom({ plugin: 'clawd-panel', key: 'band' } as const, false)
const now = atom({ plugin: 'clawd-panel', key: 'now' } as const, 0)
const usage = atom({ plugin: 'clawd-panel', key: 'usage' } as const, null)
const breakdown = atom({ plugin: 'clawd-panel', key: 'breakdown' } as const, null)
const recounting = atom({ plugin: 'clawd-panel', key: 'recounting' } as const, false)
const session = atom({ plugin: 'clawd-panel', key: 'session' } as const, DEFAULT_SESSION)
const mainTokens = atom({ plugin: 'clawd-panel', key: 'mainTokens' } as const, EMPTY_TOKENS)
const cost = atom({ plugin: 'clawd-panel', key: 'cost' } as const, { turns: [] })
const agents = atom({ plugin: 'clawd-panel', key: 'agents' } as const, {})
const files = atom({ plugin: 'clawd-panel', key: 'files' } as const, {})
const tracked = atom({ plugin: 'clawd-panel', key: 'tracked' } as const, null)
const git = atom({ plugin: 'clawd-panel', key: 'git' } as const, null)
const alert = atom({ plugin: 'clawd-panel', key: 'alert' } as const, { crossed: false, dismissed: false })
const avatar = atom({ plugin: 'clawd-panel', key: 'avatar' } as const, DEFAULT_AVATAR)
const avatarState = atom({ plugin: 'clawd-panel', key: 'avatarState' } as const, 'idle')
const avatarFrames = atom({ plugin: 'clawd-panel', key: 'avatarFrames' } as const, null)
const avatarNote = atom({ plugin: 'clawd-panel', key: 'avatarNote' } as const, '')
const lifetimeTurns = atom({ plugin: 'clawd-panel', key: 'lifetimeTurns' } as const, 0)
const terminal = atom({ plugin: 'clawd-panel', key: 'terminal' } as const, '')

// ---------------------------------------------------------------------------
// Store

async function stored($: EngineInterface, key: string): Promise<unknown> {
  try {
    return await $.store.get(key)
  } catch {
    return undefined
  }
}

async function persist($: EngineInterface, key: string, value: unknown): Promise<void> {
  try {
    await $.store.set(key, value)
  } catch {
    // The store is a convenience; the session keeps working without it.
  }
}

/** Copies what `$.store` keeps into `$.state`: at start, and after /clear, /resume and /branch. */
async function rehydrate($: EngineInterface): Promise<void> {
  const savedAvatar = await stored($, STORE.avatar)
  await update($, avatar, () => (isAvatarConfig(savedAvatar) ? savedAvatar : DEFAULT_AVATAR))
  const savedBand = await stored($, STORE.band)
  await update($, band, () => savedBand === true)
  const savedTurns = await stored($, STORE.lifetimeTurns)
  await update($, lifetimeTurns, () => (typeof savedTurns === 'number' ? savedTurns : 0))
}

// ---------------------------------------------------------------------------
// Collectors' I/O: each asks `$`, hands the answer to a pure collector, and
// writes the result. A failed read leaves the last good value standing.

function debug($: EngineInterface, what: string, error: unknown): void {
  $.ui.log(`clawd-panel: ${what}: ${error instanceof Error ? error.message : String(error)}`, { to: 'debug' })
}

/** Reads `$.session.usage()`, with the /context breakdown when `detail` is given. */
async function refreshUsage($: EngineInterface, detail?: 'summary' | 'full'): Promise<void> {
  try {
    const u = detail ? await $.session.usage({ breakdown: detail, columns: GRID_COLUMNS }) : await $.session.usage()
    const at = await $.clock.now()
    const snap = snapshotUsage(u, at, u.startedAt)
    await update($, usage, () => snap)
    const b = u.context.breakdown
    if (b !== undefined) await update($, breakdown, () => reduceBreakdown(b, detail ?? 'summary', at))
    await checkAlert($, snap.contextPercent)
  } catch (error) {
    debug($, 'usage was not read', error)
  }
}

/** Raises the context alert once per crossing of the threshold. */
async function checkAlert($: EngineInterface, percent: number | undefined): Promise<void> {
  let toast = false
  await update($, alert, a => {
    const step = alertStep(a, percent, config().alertThreshold)
    toast = step.toast
    return step.next
  })
  if (toast && percent !== undefined) $.ui.toast(alertText(percent), { timeoutMs: 6000 })
}

async function refreshSession($: EngineInterface): Promise<void> {
  try {
    const model = await $.session.model()
    const turns = await $.session.turns()
    const cwd = await $.session.cwd()
    const home = await $.env.get('HOME')
    await update($, session, s => (home === undefined ? { ...s, model, turns, cwd } : { ...s, model, turns, cwd, home }))
  } catch (error) {
    debug($, 'the session was not read', error)
  }
}

async function refreshAgents($: EngineInterface): Promise<void> {
  try {
    const list = await $.agent.list()
    const at = await $.clock.now()
    await update($, agents, a => listed(a, list, at))
  } catch (error) {
    debug($, 'the agent list was not read', error)
  }
}

/** Runs a git command; its stdout, or undefined when git failed or is missing. */
async function gitOut($: EngineInterface, argv: readonly string[], cwd?: string): Promise<string | undefined> {
  try {
    const r = await $.process.run(argv, cwd === undefined ? { timeoutMs: 10000 } : { cwd, timeoutMs: 10000 })
    return r.exitCode === 0 ? r.stdout : undefined
  } catch {
    return undefined
  }
}

async function refreshGit($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  const top = await gitOut($, ARGV.toplevel)
  if (top === undefined) {
    await update($, git, () => emptyGit(at, 'not a git repository'))
    return
  }
  const root = top.trim()
  const status = parseStatus((await gitOut($, ARGV.status)) ?? '')
  const numstat = parseNumstat((await gitOut($, ARGV.numstat)) ?? '')
  const branches = parseBranches((await gitOut($, ARGV.branches)) ?? '', Math.floor(at / 1000), root)
  const log = parseLog((await gitOut($, ARGV.log)) ?? '')
  const snap: GitSnap = {
    at,
    isRepo: true,
    root,
    modified: status.modified,
    staged: status.staged,
    untracked: status.untracked,
    changes: withNumstat(status.changes, numstat),
    branches,
    worktrees: branches.filter(b => b.worktree !== undefined).length,
    log,
  }
  if (status.branch !== undefined) snap.branch = status.branch
  if (status.head !== undefined) snap.head = status.head
  if (status.ahead !== undefined) snap.ahead = status.ahead
  if (status.behind !== undefined) snap.behind = status.behind
  await update($, git, () => snap)
  const listing = await gitOut($, ARGV.files)
  if (listing !== undefined) await update($, tracked, () => ({ root, paths: parseFiles(listing) }))
}

let gitTimer: Timer | undefined

/** Refreshes git once things settle: a burst of turns runs git once. */
function refreshGitSoon($: EngineInterface): void {
  gitTimer?.cancel()
  gitTimer = $.clock.after(1500, () => {
    gitTimer = undefined
    void refreshGit($)
  })
}

/** Finds the branch and worktree of a subagent that runs in its own `cwd`. */
async function locateAgent($: EngineInterface, agentId: string, cwd: string): Promise<void> {
  const out = await gitOut($, LOCATION_ARGV, cwd)
  if (out === undefined) return
  const where = parseLocation(out)
  await update($, agents, a => located(a, agentId, where.branch, where.worktree))
}

async function detectTerminalOf($: EngineInterface): Promise<void> {
  const env: TerminalEnv = {}
  const termProgram = await $.env.get('TERM_PROGRAM')
  if (termProgram !== undefined) env.TERM_PROGRAM = termProgram
  const term = await $.env.get('TERM')
  if (term !== undefined) env.TERM = term
  const tmux = await $.env.get('TMUX')
  if (tmux !== undefined) env.TMUX = tmux
  const sty = await $.env.get('STY')
  if (sty !== undefined) env.STY = sty
  const kitty = await $.env.get('KITTY_WINDOW_ID')
  if (kitty !== undefined) env.KITTY_WINDOW_ID = kitty
  const ghostty = await $.env.get('GHOSTTY_RESOURCES_DIR')
  if (ghostty !== undefined) env.GHOSTTY_RESOURCES_DIR = ghostty
  const force = await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')
  if (force !== undefined) env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES = force
  await update($, terminal, () => terminalWord(detectTerminal(env)))
}

/** Reads everything once: at start, and after /clear, /resume and /branch reset `$.state`. */
async function readAll($: EngineInterface): Promise<void> {
  await rehydrate($)
  const at = await $.clock.now()
  await update($, now, () => at)
  await refreshSession($)
  await refreshUsage($, 'summary')
  const u = await read($, usage)
  await update($, cost, ledger => baselineCost(ledger, u?.costUsd))
  await refreshAgents($)
  await detectTerminalOf($)
  refreshGitSoon($)
}

let ticker: Timer | undefined

// ---------------------------------------------------------------------------
// Session lifecycle

export const onSessionStart: HookOf<'session.start'> = async ($, e, next) => {
  try {
    await $.command.register({
      name: 'clawd',
      description: 'Toggle the Claude HUD pane, or open it on a tab',
      argumentHint: '[home|context|agents|git|avatar]',
      immediate: true,
    })
    await $.command.register({
      name: 'clawd-band',
      description: 'Toggle the one-line HUD band above the prompt',
      immediate: true,
    })
  } catch (error) {
    debug($, 'a command was not registered', error)
  }
  await readAll($)
  ticker?.cancel()
  ticker = $.clock.every(10000, () => {
    void tick($)
  })
  return next(e)
}

/** Every ten seconds: the clock the "ago" stamps read, and the status of running agents. */
async function tick($: EngineInterface): Promise<void> {
  const at = await $.clock.now()
  await update($, now, () => at)
  const list = Object.values(await read($, agents))
  if (list.some(a => isActive(a.status))) await refreshAgents($)
}

/** After /clear, /resume and /branch: `$.state` is back to its defaults. After a compaction: the window changed. */
export const onSessionStartClassic: HookOf<'classic.SessionStart'> = async ($, e, next) => {
  if (e.source === 'compact') {
    await refreshUsage($, 'summary')
  } else {
    await readAll($)
  }
  return next(e)
}

export const onMeasure: HookOf<'session.measure'> = async ($, e, next) => {
  const at = await $.clock.now()
  const before = await read($, usage)
  const snap = snapshotUsage(e, at, before?.startedAt ?? at)
  await update($, usage, () => snap)
  await checkAlert($, snap.contextPercent)
  return next(e)
}

export const onCompact: HookOf<'session.compact'> = async ($, e, next) => {
  const r = await next(e)
  if (e.agentId === undefined && e.trigger !== 'precompute' && !('skip' in r)) {
    const at = await $.clock.now()
    await update($, session, s => ({ ...s, compactions: s.compactions + 1, lastCompactAt: at }))
  }
  return r
}

// ---------------------------------------------------------------------------
// Turns

export const onTurnStart: HookOf<'turn.start'> = async ($, e, next) => {
  await update($, session, s => ({ ...s, isWorking: true }))
  await update($, avatarState, () => 'thinking')
  return next(e)
}

export const onStep: HookOf<'turn.step'> = async function* ($, e, next) {
  const effort = effortWord(e.effort)
  if (e.agentId === undefined) {
    await update($, session, s => (effort === undefined ? s : { ...s, effort }))
    await update($, avatarState, st => (st === 'tool' ? st : 'thinking'))
  }
  const r = yield* next(e)
  if (e.agentId === undefined) {
    await update($, mainTokens, t => addStep(t, r.usage))
  } else {
    const at = await $.clock.now()
    const id = e.agentId
    await update($, agents, a => stepped(a, id, r.usage, effort, at))
  }
  return r
}

let idleTimer: Timer | undefined

export const onTurnComplete: HookOf<'turn.complete'> = async ($, e, next) => {
  const r = await next(e)
  if (e.agentId !== undefined) {
    const at = await $.clock.now()
    const id = e.agentId
    await update($, agents, a => completed(a, id, at, e.isAborted))
    await refreshAgents($)
    return r
  }
  await update($, session, s => ({ ...s, isWorking: false }))
  await update($, avatarState, () => 'done')
  idleTimer?.cancel()
  idleTimer = $.clock.after(4000, () => {
    void update($, avatarState, st => (st === 'done' ? 'idle' : st))
  })
  await refreshUsage($, 'summary')
  const u = await read($, usage)
  await update($, cost, ledger => recordCost(ledger, u?.costUsd))
  await refreshSession($)
  const turns = await update($, lifetimeTurns, n => n + 1)
  await persist($, STORE.lifetimeTurns, turns)
  await refreshAgents($)
  refreshGitSoon($)
  return r
}

// ---------------------------------------------------------------------------
// Tools and subagents

export const onToolCall: HookOf<'tool.call'> = async ($, e, next) => {
  const isMain = e.agentId === undefined
  if (isMain) await update($, avatarState, () => 'tool')
  const r = await next(e)
  if (isMain) await update($, avatarState, st => (st === 'tool' ? 'thinking' : st))
  const file = fileOf(String(e.tool), e as unknown as Record<string, unknown>)
  if (file !== undefined && (FILE_TOOLS as readonly string[]).includes(String(e.tool)) && r.deny === undefined && r.isError !== true) {
    const agentId = e.agentId ?? ''
    await update($, files, f => markFile(f, file.path, file.kind, agentId))
  }
  return r
}

export const onSpawn: HookOf<'agent.spawn'> = async ($, e, next) => {
  const r = await next(e)
  if ('deny' in r && r.deny !== undefined) return r
  const at = await $.clock.now()
  await update($, agents, a => spawned(a, e, r, at))
  const id = r.agentId
  const cwd = e.cwd
  if (id !== undefined && cwd !== undefined) {
    $.clock.after(0, () => {
      void locateAgent($, id, cwd)
    })
  }
  return r
}

// ---------------------------------------------------------------------------
// Commands

export const onCommand: HookOf<'command.run'> = async ($, e) => {
  if (e.command === 'clawd-band') {
    const shown = await update($, band, isShown => !isShown)
    await persist($, STORE.band, shown)
    return {}
  }
  const wanted = e.args.trim().toLowerCase()
  if (wanted !== '' && !isTab(wanted)) {
    return { text: `Unknown tab "${wanted}". Tabs: home, context, agents, git, avatar.` }
  }
  const isOpen = (await $.ui.panes()).some(p => p.id === PANE)
  if (isTab(wanted)) {
    await update($, tab, () => wanted)
  } else if (isOpen) {
    await $.ui.close({ id: PANE })
    return {}
  }
  const c = config()
  await $.ui.open({ id: PANE, title: c.title, focus: true, closeOnEscape: true, columns: c.dockColumns })
  return {}
}

// ---------------------------------------------------------------------------
// Drawing: read state, build the tree. No git, files or model calls here;
// the handlers built here may do I/O, as a press is not a render.

/** Whether the avatar draws as an Image or as Raster cells, from the setting and the terminal. */
function drawnAs(mode: RenderMode, term: string, surface: RenderSurface): Drawn {
  if (surface !== 'terminal') return 'cells'
  if (mode === 'cells') return 'cells'
  if (mode === 'image') return 'image'
  return parseTerminalWord(term).images ? 'image' : 'cells'
}

/** Clawd's picture for the current state, as `key`: the built-in sprite or the person's own frames. */
async function avatarPicture($: EngineInterface, ctx: Ctx, key: string, override?: { state: AvatarState; frame: number }): Promise<RenderElement> {
  const config = await read($, avatar)
  const term = await read($, terminal)
  const state = override?.state ?? (await read($, avatarState))
  const frame = override?.frame ?? 0
  const custom = await read($, avatarFrames)
  const px = framePixels(custom, state, frame, ctx.pal.sprite)
  return picture(ctx, key, px, drawnAs(config.mode, term, ctx.surface), `Clawd · ${STATE_TEXT[state]}`)
}

async function homeData($: EngineInterface, ctx: Ctx, s: SessionSnap): Promise<HomeData> {
  const g = await read($, git)
  const d: HomeData = {
    turns: s.turns,
    usage: await read($, usage),
    tokens: await read($, mainTokens),
    cost: await read($, cost),
    alert: await read($, alert),
    threshold: config().alertThreshold,
    avatarState: await read($, avatarState),
    level: levelOf(await read($, lifetimeTurns)),
    detail: (await read($, breakdown))?.detail ?? 'summary',
    avatar: await avatarPicture($, ctx, 'avatar-home'),
    refresh: () => {
      void refreshUsage($, 'summary')
      void refreshGit($)
    },
  }
  if (g?.branch !== undefined) d.branch = g.branch
  if (g?.ahead !== undefined) d.ahead = g.ahead
  if (g?.behind !== undefined) d.behind = g.behind
  if (s.model !== undefined) d.model = s.model
  if (s.effort !== undefined) d.effort = s.effort
  if (s.cwd !== undefined) d.cwd = s.cwd
  if (s.home !== undefined) d.home = s.home
  return d
}

/** Flips one entry of the `expanded` set: a section, an agent row, a tree folder. */
function toggler($: EngineInterface): (key: string) => void {
  return key => {
    void update($, expanded, list => (list.includes(key) ? list.filter(x => x !== key) : [...list, key]))
  }
}

async function contextData($: EngineInterface, s: SessionSnap): Promise<ContextData> {
  const d: ContextData = {
    breakdown: await read($, breakdown),
    showGrid: await read($, showGrid),
    expanded: new Set(await read($, expanded)),
    recounting: await read($, recounting),
    compactions: s.compactions,
    files: await read($, files),
    tracked: await read($, tracked),
    toggle: toggler($),
    toggleGrid: () => {
      void update($, showGrid, shown => !shown)
    },
    recount: () => {
      void recount($)
    },
  }
  if (s.cwd !== undefined) d.cwd = s.cwd
  if (s.home !== undefined) d.home = s.home
  return d
}

/** The Precise recount: a `full` breakdown, which sends token-count requests, once at a time. */
async function recount($: EngineInterface): Promise<void> {
  if (await read($, recounting)) return
  await update($, recounting, () => true)
  try {
    await refreshUsage($, 'full')
  } finally {
    await update($, recounting, () => false)
  }
}

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const c = config()
  const { el, extra } = elementsOf($.ui.resolve(e), e.surface)
  const ctx: Ctx = {
    el,
    extra,
    site: PANE,
    surface: e.surface,
    width: bodyWidth(e.props.bodyColumns),
    pal: paletteOf(c.theme),
    now: await read($, now),
  }
  const active = await read($, tab)
  const s = await read($, session)
  const selectTab = (id: TabId) => {
    void update($, tab, () => id)
  }
  let body: RenderElement
  switch (active) {
    case 'home':
      body = home(ctx, await homeData($, ctx, s))
      break
    case 'context':
      body = context(ctx, await contextData($, s))
      break
    default:
      body = placeholder(ctx, `${active} — not drawn yet`)
  }
  return pane(ctx, { name: c.title, version: VERSION, isWorking: s.isWorking, tab: active, selectTab }, body)
}
