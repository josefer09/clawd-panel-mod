// Every hook of the mod and every `$` call it makes. The engine's scanner
// follows `$` only into functions declared in the file that uses it, so the
// I/O lives here; what to do with the answers lives in src/collectors (pure)
// and what to draw in src/render (pure).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, HookOf, ImageSource, RenderElement, RenderInput, RenderSurface, Timer } from 'claude-code'

import type { AvatarConfig, AvatarState, GitSnap, RenderMode, SessionSnap, TabId } from '../types'
import { baseName, expandPath, framesOf, halve, single, sliceSheet } from './collectors/avatar'
import { completed, isActive, listed, located, LOCATION_ARGV, parseLocation, spawned, stepped } from './collectors/agents'
import { GRID_COLUMNS, reduceBreakdown } from './collectors/context'
import { FILE_TOOLS, fileOf, markFile } from './collectors/files'
import { ARGV, emptyGit, parseBranches, parseFiles, parseLog, parseNumstat, parseStatus, withNumstat } from './collectors/git'
import { addStep, alertStep, alertText, baselineCost, effortWord, recordCost, snapshotUsage } from './collectors/session'
import { detectTerminal, parseTerminalWord, terminalWord } from './collectors/terminal'
import type { TerminalEnv } from './collectors/terminal'
import { config, VERSION } from './config'
import { bodyWidth, pane, placeholder } from './render/draw'
import type { AlertBanner, Chrome } from './render/draw'
import { band as bandTree } from './render/band'
import type { BandData } from './render/band'
import { isTab } from './render/pane'
import { imageSourceOf, picture, rasterCells } from './render/avatar'
import type { Drawn } from './render/avatar'
import { frameCount, framePixels, levelOf } from './render/avatarFrames'
import { scale2, unbase64 } from './render/raster/cells'
import type { Pixels } from './render/raster/cells'
import { decodePng } from './render/raster/png'
import { emptyStateSprite, FPS, frameAt, mini, sprite, STATE_TEXT, STATES } from './render/raster/sprite'
import { agentsTab } from './render/tabs/agents'
import { avatarTab } from './render/tabs/avatar'
import type { AvatarData } from './render/tabs/avatar'
import type { AgentsData } from './render/tabs/agents'
import { context } from './render/tabs/context'
import { gitTab } from './render/tabs/git'
import type { GitData } from './render/tabs/git'
import type { ContextData } from './render/tabs/context'
import { home, homeInline } from './render/tabs/home'
import type { HomeData } from './render/tabs/home'
import { elementsOf, Line } from './render/ui'
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
const previewing = atom({ plugin: 'clawd-panel', key: 'previewing' } as const, false)
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
  await loadAvatar($)
  refreshGitSoon($)
  if ((await $.ui.panes()).some(p => p.id === PANE)) startAnimator($)
}

/** Reads and decodes the configured sprite or sheet into frames; a failure leaves the built-in Clawd and says why. */
async function loadAvatar($: EngineInterface): Promise<void> {
  const c = await read($, avatar)
  const path = c.sheetPath || c.spritePath
  if (path === '') {
    await update($, avatarFrames, () => null)
    return
  }
  const s = await read($, session)
  const given = expandPath(path, s.home)
  const full = given.startsWith('/') || s.cwd === undefined ? given : `${s.cwd}/${given}`
  try {
    const file = await $.fs.read(full, { as: 'bytes' })
    const px = decodePng(unbase64(file.base64))
    const frames = c.sheetPath ? sliceSheet(px, c.framesPerRow) : single(px)
    const loaded = framesOf(full, frames)
    await update($, avatarFrames, () => loaded)
    const count = STATES.map(st => frames[st].length).join('/')
    await update($, avatarNote, () => `Loaded ${baseName(full)}: ${loaded.width}×${loaded.height} px, frames ${count}.`)
  } catch (error) {
    await update($, avatarFrames, () => null)
    await update($, avatarNote, () => `Could not load ${baseName(full)}: ${error instanceof Error ? error.message : String(error)}. Showing Clawd.`)
  }
}

// ---------------------------------------------------------------------------
// Animation: `$.ui.blit` repaints the keyed avatar pictures in place, at the
// sprite frame rate, while the pane is open. Nothing is drawn again.

let animTimer: Timer | undefined
let animFrame = 0
/** Which keyed pictures the last drawing mounted on the terminal, by key. */
let animTargets: Record<string, Drawn> = {}
const frameCache = new Map<string, { cells: string } | { source: ImageSource }>()

function startAnimator($: EngineInterface): void {
  if (animTimer !== undefined) return
  animTimer = $.clock.every(Math.round(1000 / FPS), () => {
    void animate($)
  })
}

function stopAnimator(): void {
  animTimer?.cancel()
  animTimer = undefined
  animTargets = {}
  lastBlit = {}
}

/** The last frame blitted to each key, so an unchanged frame is not sent again. */
let lastBlit: Record<string, string> = {}

async function animate($: EngineInterface): Promise<void> {
  animFrame += 1
  if (animFrame % (FPS * 5) === 0 && !(await $.ui.panes()).some(p => p.id === PANE)) {
    stopAnimator()
    return
  }
  const keys = Object.keys(animTargets)
  if (keys.length === 0) return
  const custom = await read($, avatarFrames)
  const state = await read($, avatarState)
  const isPreviewing = await read($, previewing)
  const pal = paletteOf(config().theme).sprite
  for (const key of keys) {
    const drawn = animTargets[key]
    if (drawn === undefined) continue
    const st = key === 'avatar-preview' && isPreviewing ? (STATES[Math.floor(animFrame / (FPS * 2)) % STATES.length] ?? state) : state
    const count = frameCount(custom, st)
    const f = custom ? animFrame % count : frameAt(st, animFrame)
    const cacheKey = `${key}:${drawn}:${st}:${f}:${custom?.source ?? 'clawd'}:${config().theme}`
    if (lastBlit[key] === cacheKey) continue
    let made = frameCache.get(cacheKey)
    if (made === undefined) {
      const full = framePixels(custom, st, f, pal)
      const px = key === 'avatar-mini' ? halfOf(full, custom !== null, pal.eye) : full
      made = drawn === 'image' ? { source: imageSourceOf(px) } : { cells: rasterCells(px).cells }
      if (frameCache.size > 64) frameCache.clear()
      frameCache.set(cacheKey, made)
    }
    const r = 'source' in made ? await $.ui.blit({ requestId: PANE, key, source: made.source }) : await $.ui.blit({ requestId: PANE, key, cells: made.cells })
    if (r.deny !== undefined) delete animTargets[key]
    else lastBlit[key] = cacheKey
  }
}

export const onPaneClose: HookOf<'ui.close'> = async ($, e, next) => {
  if (e.id === PANE) stopAnimator()
  return next(e)
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
    $.clock.after(0, () => {
      void refreshAgents($)
    })
    return r
  }
  await update($, session, s => ({ ...s, isWorking: false }))
  await update($, avatarState, () => 'done')
  idleTimer?.cancel()
  idleTimer = $.clock.after(4000, () => {
    void update($, avatarState, st => (st === 'done' ? 'idle' : st))
  })
  // The reads outlive the turn's dispatch: the turn ends now, the HUD catches up.
  $.clock.after(0, () => {
    void afterTurn($)
  })
  return r
}

/** After a main-loop turn: usage and the breakdown, the turn's cost, the session, lifetime turns, agents, git. */
async function afterTurn($: EngineInterface): Promise<void> {
  await refreshUsage($, 'summary')
  const u = await read($, usage)
  await update($, cost, ledger => recordCost(ledger, u?.costUsd))
  await refreshSession($)
  // Read the store right before writing: every session on the machine counts into it.
  const saved = await stored($, STORE.lifetimeTurns)
  const turns = (typeof saved === 'number' ? saved : await read($, lifetimeTurns)) + 1
  await persist($, STORE.lifetimeTurns, turns)
  await update($, lifetimeTurns, () => turns)
  await refreshAgents($)
  refreshGitSoon($)
}

// ---------------------------------------------------------------------------
// Tools and subagents

/** The main loop's tool calls still running: Clawd holds the tool pose until the last one ends. */
let toolsInFlight = 0

export const onToolCall: HookOf<'tool.call'> = async ($, e, next) => {
  const isMain = e.agentId === undefined
  if (isMain) {
    toolsInFlight += 1
    await update($, avatarState, () => 'tool')
  }
  let r: Awaited<ReturnType<typeof next>>
  try {
    r = await next(e)
  } finally {
    if (isMain) toolsInFlight = Math.max(0, toolsInFlight - 1)
  }
  if (isMain && toolsInFlight === 0) await update($, avatarState, st => (st === 'tool' ? 'thinking' : st))
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
  startAnimator($)
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
async function avatarPicture($: EngineInterface, ctx: Ctx, key: string, override?: { state: AvatarState; frame: number }, half = false): Promise<RenderElement> {
  const cfg = await read($, avatar)
  const term = await read($, terminal)
  const state = override?.state ?? (await read($, avatarState))
  const frame = override?.frame ?? 0
  const custom = await read($, avatarFrames)
  const full = framePixels(custom, state, frame, ctx.pal.sprite)
  const px = half ? halfOf(full, custom !== null, ctx.pal.sprite.eye) : full
  const drawn = drawnAs(cfg.mode, term, ctx.surface)
  if (ctx.surface === 'terminal') animTargets[key] = drawn
  const isSingle = !half && cfg.spritePath !== '' && cfg.sheetPath === '' && custom !== null
  const source: ImageSource | undefined = isSingle && drawn === 'image' ? { file: custom.source, format: 'png' } : undefined
  return picture(ctx, key, px, drawn, `Clawd · ${STATE_TEXT[state]}`, source)
}

/** A frame at half size: the mockup's `mini()` for Clawd, a plain halving for a custom sprite. */
function halfOf(px: Pixels, isCustom: boolean, eye: string): Pixels {
  return isCustom ? halve(px) : mini(px, eye)
}

async function homeData($: EngineInterface, ctx: Ctx, s: SessionSnap, inline = false): Promise<HomeData> {
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
    avatar: inline ? Line(ctx, [], 'no-avatar') : await avatarPicture($, ctx, 'avatar-home'),
    refresh: () => {
      void refreshUsage($, 'summary')
      void refreshGit($)
    },
  }
  if (inline) d.mini = await avatarPicture($, ctx, 'avatar-mini', undefined, true)
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

async function agentsData($: EngineInterface, ctx: Ctx, s: SessionSnap): Promise<AgentsData> {
  const g = await read($, git)
  const cfg = await read($, avatar)
  const term = await read($, terminal)
  const custom = await read($, avatarFrames)
  const own = custom?.frames.idle?.[0]
  const px = own ? (own.length <= 28 && (own[0]?.length ?? 0) <= 24 ? scale2(own) : own) : scale2(emptyStateSprite(ctx.pal.sprite))
  const d: AgentsData = {
    agents: await read($, agents),
    files: await read($, files),
    expanded: new Set(await read($, expanded)),
    emptyAvatar: picture(ctx, 'avatar-empty', px, drawnAs(cfg.mode, term, ctx.surface), 'Clawd, idle'),
    toggle: toggler($),
  }
  if (g?.branch !== undefined) d.branch = g.branch
  if (g?.root !== undefined) d.root = g.root
  if (s.cwd !== undefined) d.cwd = s.cwd
  if (s.home !== undefined) d.home = s.home
  return d
}

/** Saves the avatar settings to `$.store` (paths, never bytes) and reloads the sprite. */
async function setAvatar($: EngineInterface, change: (c: AvatarConfig) => AvatarConfig): Promise<void> {
  const next = await update($, avatar, change)
  await persist($, STORE.avatar, next)
  frameCache.clear()
  await loadAvatar($)
}

async function avatarData($: EngineInterface, ctx: Ctx): Promise<AvatarData> {
  const c = await read($, avatar)
  const custom = await read($, avatarFrames)
  const state = await read($, avatarState)
  const isPreviewing = await read($, previewing)
  const term = parseTerminalWord(await read($, terminal))
  const pal = ctx.pal.sprite
  const thumbs = {} as Record<AvatarState, Pixels>
  for (const st of STATES) thumbs[st] = custom ? halve(framePixels(custom, st, 0, pal)) : mini(sprite(st, pal), pal.eye)
  const first = framePixels(custom, state, 0, pal)
  return {
    config: c,
    state,
    preview: await avatarPicture($, ctx, 'avatar-preview'),
    thumbs,
    frame: animFrame,
    frameCount: frameCount(custom, state),
    canvas: { w: first.reduce((n, r) => Math.max(n, r.length), 0), h: first.length },
    drawn: drawnAs(c.mode, await read($, terminal), ctx.surface),
    source: custom ? baseName(custom.source) : 'built-in Clawd',
    note: await read($, avatarNote),
    terminal: term,
    previewing: isPreviewing,
    setSpritePath: path => {
      void setAvatar($, a => ({ ...a, spritePath: path.trim() }))
    },
    setSheetPath: path => {
      void setAvatar($, a => ({ ...a, sheetPath: path.trim() }))
    },
    setFramesPerRow: text => {
      const n = Math.round(Number(text))
      if (Number.isFinite(n) && n >= 1 && n <= 64) void setAvatar($, a => ({ ...a, framesPerRow: n }))
      else void update($, avatarNote, () => `Frames/row takes a whole number from 1 to 64, not "${text}".`)
    },
    setMode: m => {
      void setAvatar($, a => ({ ...a, mode: m }))
    },
    reset: () => {
      void (async () => {
        await update($, avatarNote, () => '')
        await update($, previewing, () => false)
        await setAvatar($, () => DEFAULT_AVATAR)
      })()
    },
    togglePreview: () => {
      void (async () => {
        await update($, previewing, on => !on)
        startAnimator($)
      })()
    },
  }
}

async function gitData($: EngineInterface): Promise<GitData> {
  const list = Object.values(await read($, agents))
  return {
    git: await read($, git),
    agentBranches: new Set(list.filter(a => a.worktree !== undefined && a.branch !== undefined).map(a => a.branch as string)),
    refresh: () => {
      void refreshGit($)
    },
  }
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
  if (e.surface === 'terminal') {
    animTargets = {}
    lastBlit = {}
  }
  const selectTab = (id: TabId) => {
    void update($, tab, () => id)
    startAnimator($)
  }
  let body: RenderElement
  switch (active) {
    case 'home':
      body = e.props.placement === 'inline' ? homeInline(ctx, await homeData($, ctx, s, true)) : home(ctx, await homeData($, ctx, s))
      break
    case 'context':
      body = context(ctx, await contextData($, s))
      break
    case 'agents':
      body = agentsTab(ctx, await agentsData($, ctx, s))
      break
    case 'git':
      body = gitTab(ctx, await gitData($))
      break
    case 'avatar':
      body = avatarTab(ctx, await avatarData($, ctx))
      break
    default:
      body = placeholder(ctx, `${active} — not drawn yet`)
  }
  const chrome: Chrome = { name: c.title, version: VERSION, isWorking: s.isWorking, tab: active, selectTab }
  const banner = await alertBanner($)
  if (banner !== undefined) chrome.alert = banner
  return pane(ctx, chrome, body)
}

/** The context alert's banner while it stands and was not dismissed. */
async function alertBanner($: EngineInterface): Promise<AlertBanner | undefined> {
  const a = await read($, alert)
  const u = await read($, usage)
  if (!a.crossed || a.dismissed || u?.contextPercent === undefined) return undefined
  const b = await read($, breakdown)
  const banner: AlertBanner = {
    percent: u.contextPercent,
    window: u.contextWindow,
    compact: () => {
      void (async () => {
        await update($, alert, x => ({ ...x, dismissed: true }))
        try {
          await $.session.compact()
        } catch (error) {
          debug($, 'compaction was not started', error)
        }
      })()
    },
    dismiss: () => {
      void update($, alert, x => ({ ...x, dismissed: true }))
    },
  }
  if (u.contextTokens !== undefined) banner.tokens = u.contextTokens
  if (b?.isAutoCompactEnabled && b.autoCompactThreshold !== undefined && b.rawMaxTokens > 0) banner.autoCompactAt = (b.autoCompactThreshold / b.rawMaxTokens) * 100
  return banner
}

/** The band above the prompt (board 2c), while /clawd-band has it on. */
export async function drawBand($: EngineInterface, e: RenderInput<'AbovePrompt'>, next: (e: RenderInput<'AbovePrompt'>) => Promise<RenderElement>): Promise<RenderElement> {
  if (e.props.hasSurvey || !(await read($, band))) return next(e)
  const c = config()
  const { el, extra } = elementsOf($.ui.resolve(e), e.surface)
  const ctx: Ctx = { el, extra, site: 'band', surface: e.surface, width: Math.max(20, e.props.bodyColumns), pal: paletteOf(c.theme), now: 0 }
  const s = await read($, session)
  const g = await read($, git)
  const d: BandData = {
    usage: await read($, usage),
    threshold: c.alertThreshold,
    isWorking: s.isWorking || e.props.isWorking,
    open: () => {
      void (async () => {
        await $.ui.open({ id: PANE, title: c.title, focus: true, closeOnEscape: true, columns: c.dockColumns })
        startAnimator($)
      })()
    },
  }
  if (g?.branch !== undefined) d.branch = g.branch
  if (s.model !== undefined) d.model = s.model
  if (s.effort !== undefined) d.effort = s.effort
  return bandTree(ctx, d)
}
