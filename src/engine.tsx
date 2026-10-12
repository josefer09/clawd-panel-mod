// Every hook of the mod and every `$` call it makes. The engine's scanner
// follows `$` only into functions declared in the file that uses it, so the
// I/O lives here; what to do with the answers lives in src/collectors (pure)
// and what to draw in src/render (pure).

import { atom, read, update } from 'claude-code'
import type { EngineInterface, HookOf, RenderElement, RenderInput } from 'claude-code'

import type { TabId } from '../types'
import { config, VERSION } from './config'
import { bodyWidth, pane, placeholder } from './render/draw'
import { isTab } from './render/pane'
import type { Ctx } from './render/ui'
import { DEFAULT_AVATAR, DEFAULT_SESSION, EMPTY_TOKENS, isAvatarConfig, PANE, STORE } from './state'
import { paletteOf } from './theme'

// ---------------------------------------------------------------------------
// State: every value a drawing reads (types/index.d.ts declares them)

const tab = atom({ plugin: 'clawd-panel', key: 'tab' } as const, 'home')
const expanded = atom({ plugin: 'clawd-panel', key: 'expanded' } as const, [])
const showGrid = atom({ plugin: 'clawd-panel', key: 'showGrid' } as const, false)
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
// Session lifecycle

export const onSessionStart: HookOf<'session.start'> = async ($, e, next) => {
  await rehydrate($)
  await update($, now, () => Date.now())
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
    $.ui.log(`clawd-panel: a command was not registered: ${String(error)}`, { to: 'debug' })
  }
  return next(e)
}

export const onSessionReset: HookOf<'classic.SessionStart'> = async ($, e, next) => {
  await rehydrate($)
  return next(e)
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
// Drawing

export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const c = config()
  const ctx: Ctx = {
    el: $.ui.resolve(e),
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
  return pane(ctx, { name: c.title, version: VERSION, isWorking: s.isWorking, tab: active, selectTab }, placeholder(ctx, `${active} — not drawn yet`))
}
