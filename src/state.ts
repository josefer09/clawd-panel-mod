// The defaults of the mod's `$.state` values and the `$.store` keys that
// outlive a session. The atoms themselves are declared in src/engine.tsx, the
// one file that reads and writes them (the engine's scanner reads an atom only
// in the file that declares it). `$.state` resets on /clear, /resume and
// /branch; the engine copies the stored values back in after each of those.

import type { AvatarConfig, SessionSnap, TokenTotals } from '../types'

export const PANE = 'clawd'

export const EMPTY_TOKENS: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, requests: 0 }

export const DEFAULT_AVATAR: AvatarConfig = { mode: 'auto', spritePath: '', sheetPath: '', framesPerRow: 4 }

export const DEFAULT_SESSION: SessionSnap = { turns: 0, isWorking: false, compactions: 0 }


/** `$.store` keys. The store holds paths and settings, never sprite bytes. */
export const STORE = {
  avatar: 'avatar',
  band: 'band',
  lifetimeTurns: 'lifetimeTurns',
} as const

export function isAvatarConfig(value: unknown): value is AvatarConfig {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    (v.mode === 'auto' || v.mode === 'image' || v.mode === 'cells') &&
    typeof v.spritePath === 'string' &&
    typeof v.sheetPath === 'string' &&
    typeof v.framesPerRow === 'number'
  )
}
