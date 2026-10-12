// Which pixels the avatar shows: the person's own frames when a sprite was
// loaded, else the built-in Clawd. And the level the Home tab shows.

import type { AvatarState, SpriteFrames } from '../../types'
import type { SpritePalette } from '../theme'
import type { Pixels } from './raster/cells'
import { FRAMES, sprite } from './raster/sprite'

export function framePixels(custom: SpriteFrames | null, state: AvatarState, frame: number, pal: SpritePalette): Pixels {
  const own = custom?.frames[state]
  if (own !== undefined && own.length > 0) return own[((frame % own.length) + own.length) % own.length] ?? sprite(state, pal, frame)
  return sprite(state, pal, frame)
}

export function frameCount(custom: SpriteFrames | null, state: AvatarState): number {
  const own = custom?.frames[state]
  return own !== undefined && own.length > 0 ? own.length : FRAMES
}

/** The level: the floor of the square root of the turns this mod has seen end, across sessions. */
export function levelOf(lifetimeTurns: number): number {
  return Math.floor(Math.sqrt(Math.max(0, lifetimeTurns)))
}
