// Clawd, the built-in avatar: a 24×28 pixel sprite per state, ported from the
// mockup's `sprite(st)` pixel for pixel, drawn as 24×14 half-block cells.
// Each state has an animation: frame 0 is the mockup's picture, the others
// move one detail of it (a blink, the bulb's glow, the hammer, the heart).

import type { AvatarState } from '../../../types'
import type { SpritePalette } from '../../theme'
import { blank } from './cells'
import type { Pixels } from './cells'

export const SPRITE_W = 24
export const SPRITE_H = 28
export const STATES: readonly AvatarState[] = ['idle', 'thinking', 'tool', 'done']

/** Frames per state, and the frame rate the Avatar tab shows. */
export const FRAMES = 4
export const FPS = 6

/**
 * Which frame each tick of the 6 fps clock shows, per state: a blink every
 * three seconds, the bulb pulsing once a second, the hammer swinging, the heart
 * bobbing. Custom frames play in order instead.
 */
export const SEQUENCE: Record<AvatarState, readonly number[]> = {
  idle: [...Array<number>(17).fill(0), 2],
  thinking: [0, 0, 0, 1, 1, 1],
  tool: [0, 1, 2, 3],
  done: [0, 0, 1, 1, 2, 2, 3, 3],
}

export function frameAt(state: AvatarState, tick: number): number {
  const seq = SEQUENCE[state]
  return seq[((tick % seq.length) + seq.length) % seq.length] ?? 0
}

export const STATE_TEXT: Record<AvatarState, string> = {
  idle: 'Idle',
  thinking: 'Thinking…',
  tool: 'Using tool',
  done: 'Done',
}

/** Clawd in `state`, animation frame `frame` (0 is the mockup's frame). */
export function sprite(state: AvatarState, pal: SpritePalette, frame = 0): Pixels {
  const g = blank(SPRITE_W, SPRITE_H)
  const R = (x: number, y: number, w: number, h: number, c: string) => {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const row = g[y + j]
        if (row !== undefined && x + i >= 0 && x + i < SPRITE_W) row[x + i] = c
      }
    }
  }
  const U = (x: number, y: number, w: number, h: number, c: string) => R(x * 2, y * 2, w * 2, h * 2, c)
  const K = pal.eye
  const f = ((frame % FRAMES) + FRAMES) % FRAMES
  // Body, arms and legs (the mockup's 2-pixel units).
  U(1, 5, 9, 7, pal.body)
  U(0, 7, 1, 3, pal.body)
  U(10, 7, 1, 3, pal.body)
  for (const leg of [1, 3, 7, 9]) U(leg, 12, 1, 2, pal.body)
  if (state === 'idle') {
    if (f === 2) {
      // A blink.
      R(4, 15, 2, 1, K)
      R(16, 15, 2, 1, K)
    } else {
      R(4, 14, 2, 2, K)
      R(16, 14, 2, 2, K)
    }
  }
  if (state === 'thinking') {
    R(5, 13, 2, 2, K)
    R(17, 13, 2, 2, K)
    const x0 = 12
    const lit = f % 2 === 0
    R(x0 + 1, 0, 6, 1, pal.bulb)
    R(x0, 1, 8, 6, pal.bulb)
    R(x0 + 1, 1, 6, 5, lit ? pal.bulbLight : pal.bulb)
    R(x0 + 1, 7, 6, 1, pal.bulb)
    R(x0 + 2, 8, 4, 1, pal.bulbBase1)
    R(x0 + 2, 9, 4, 1, pal.bulbBase2)
    R(x0 + 2, 3, 1, 1, body(pal))
    R(x0 + 5, 3, 1, 1, body(pal))
    R(x0 + 3, 4, 2, 1, body(pal))
  }
  if (state === 'tool') {
    R(4, 15, 2, 1, K)
    R(16, 15, 2, 1, K)
    const lift = f === 1 || f === 2 ? 1 : 0
    R(22, 4 - lift, 1, 13, pal.handle)
    R(19, 1 - lift, 5, 2, pal.bulbBase2)
    R(19, 3 - lift, 5, 1, pal.bulbBase1)
    if (f === 0 || f === 3) {
      // Sparks off the hammer head.
      R(16, 0, 1, 1, pal.bulb)
      R(17, 4, 1, 1, pal.bulbLight)
      R(15, 2, 1, 1, pal.bulb)
    }
  }
  if (state === 'done') {
    for (const [x, y] of [
      [4, 13],
      [5, 14],
      [4, 15],
      [17, 13],
      [16, 14],
      [17, 15],
    ] as const) {
      R(x, y, 1, 1, K)
    }
    const x0 = 1
    const y0 = f === 1 || f === 2 ? 0 : 1
    const H = pal.heart
    R(x0 + 1, y0, 2, 1, H)
    R(x0 + 4, y0, 2, 1, H)
    R(x0, y0 + 1, 7, 2, H)
    R(x0 + 1, y0 + 3, 5, 1, H)
    R(x0 + 2, y0 + 4, 3, 1, H)
    R(x0 + 3, y0 + 5, 1, 1, H)
    R(x0 + 1, y0 + 1, 1, 1, pal.heartLight)
  }
  return g
}

/** The bulb's filament: the mockup paints it in Clawd's orange. */
function body(pal: SpritePalette): string {
  return pal.body
}

/** Half size: each 2×2 block to its most common color, eyes winning, as the mockup's `mini()` (12×14 px, 12×7 cells). */
export function mini(g: Pixels, eye: string): Pixels {
  const out: Pixels = []
  for (let j = 0; j < g.length; j += 2) {
    const row: (string | null)[] = []
    const width = g[0]?.length ?? 0
    for (let i = 0; i < width; i += 2) {
      const cs = [g[j]?.[i], g[j]?.[i + 1], g[j + 1]?.[i], g[j + 1]?.[i + 1]].filter((c): c is string => typeof c === 'string')
      if (cs.includes(eye)) {
        row.push(eye)
        continue
      }
      if (cs.length < 2) {
        row.push(null)
        continue
      }
      const count = new Map<string, number>()
      for (const c of cs) count.set(c, (count.get(c) ?? 0) + 1)
      row.push([...count.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? null)
    }
    out.push(row)
  }
  return out
}

/** The empty state's Clawd: the idle sprite below its tenth pixel row, 22 wide, as the mockup crops it. */
export function emptyStateSprite(pal: SpritePalette): Pixels {
  return sprite('idle', pal)
    .slice(10)
    .map(r => r.slice(0, 22))
}
