import { expect, mock, test } from 'claude-code/testing'

import { expandPath, fit, frameSize, sliceSheet } from '../src/collectors/avatar'
import { unbase64 } from '../src/render/raster/cells'
import { decodePng, PngError } from '../src/render/raster/png'
import { frameAt, sprite, STATES } from '../src/render/raster/sprite'
import { SPRITE } from '../src/theme'
import { PALETTE_PNG, RGB_PNG, SHEET_PNG } from './fixtures'
import { cmd, paneInput, state, stubBasics, stubSession, SURFACES, WITH_PEEK } from './kit'
import { show } from './textify'

test('the PNG decoder reads RGBA, 4-bit palette with tRNS and RGB with a color key, through every filter', () => {
  const sheet = decodePng(unbase64(SHEET_PNG))
  expect([sheet[0]?.length, sheet.length]).toEqual([96, 112])
  expect(sheet.slice(28, 56).map(r => r.slice(24, 48))).toEqual(sprite('thinking', SPRITE, 1))
  expect(decodePng(unbase64(PALETTE_PNG))).toEqual([
    [null, '#D97757', '#D97757', null, '#D4A038'],
    ['#D97757', '#1C1B1A', '#D97757', '#1C1B1A', '#D4A038'],
    ['#D97757', '#D97757', '#D97757', '#D97757', null],
  ])
  expect(decodePng(unbase64(RGB_PNG))).toEqual([
    ['#FF0000', '#00FF00', null],
    ['#0000FF', null, '#FFFFFF'],
  ])
  expect(() => decodePng(Uint8Array.from([1, 2, 3]))).toThrow(PngError)
})

test('a sheet is cut into frames per state, fitted to 24×28', () => {
  const frames = sliceSheet(decodePng(unbase64(SHEET_PNG)), 4)
  for (const st of STATES) {
    expect(frames[st].length).toBe(4)
    expect(frames[st][2]).toEqual(sprite(st, SPRITE, 2))
  }
  expect(frameSize(96, 112, 4)).toEqual({ w: 24, h: 28, rows: 4 })
  const big = Array.from({ length: 56 }, () => Array<string | null>(48).fill('#FFFFFF'))
  expect([fit(big)[0]?.length, fit(big).length]).toEqual([24, 28])
  expect(expandPath('~/s/c.png', '/Users/me')).toBe('/Users/me/s/c.png')
})

async function session($: any, on: any, env: Record<string, string> = { HOME: '/Users/me', TERM_PROGRAM: 'ghostty' }) {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, env)
  const rec = stubBasics(on)
  stubSession(on)
  const reads: string[] = []
  on('fs.read', ($: any, e: any) => {
    reads.push(e.path)
    if (e.path.endsWith('clawd-sheet.png')) return { value: { base64: SHEET_PNG } }
    if (e.path.endsWith('one.png')) return { value: { base64: PALETTE_PNG } }
    return { deny: 'ENOENT: no such file' }
  })
  const blits: any[] = []
  on('ui.blit', ($: any, e: any) => {
    blits.push(e)
    return { value: {} }
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  return { clock, rec, reads, blits }
}

test('the Avatar tab draws the preview, frames, source fields, render mode and actions on every surface', WITH_PEEK, async ($, on) => {
  await session($, on)
  await $.command.run(cmd('clawd', 'avatar'))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Avatar · terminal', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^AVATAR .* state: idle$/ })).toBeDefined()
    expect(await ui.find({ key: 'sprite-path' })).toBeDefined()
    expect(await ui.find({ key: 'sheet-path' })).toBeDefined()
    expect(await ui.find({ key: 'frames-per-row' })).toBeDefined()
    expect(await ui.find({ key: 'render-mode' })).toBeDefined()
    expect(await ui.find({ key: 'avatar-reset' })).toBeDefined()
    expect(await ui.find({ key: 'avatar-preview-anim' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /detected: ghostty · image protocol available/ })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ key: 'avatar-preview' })).toMatchObject({ type: 'Image' })
      expect(await ui.find({ key: 'thumb-thinking' })).toMatchObject({ type: 'Raster', props: { columns: 12, rows: 7 } })
    }
    await ui.unmount()
  }
})

test('loading a sheet stores its path, not its bytes; a bad path says why and keeps Clawd', WITH_PEEK, async ($, on) => {
  const { rec, reads } = await session($, on)
  await $.command.run(cmd('clawd', 'avatar'))
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.input({ key: 'sheet-path', text: '~/sprites/clawd-sheet.png' })
  expect(reads).toContain('/Users/me/sprites/clawd-sheet.png')
  expect(rec.store.get('avatar')).toEqual({ mode: 'auto', spritePath: '', sheetPath: '~/sprites/clawd-sheet.png', framesPerRow: 4 })
  expect(await state($, 'avatarNote')).toBe('Loaded clawd-sheet.png: 24×28 px, frames 4/4/4/4.')
  expect(await ui.find({ type: 'Text', text: /source +clawd-sheet\.png/ })).toBeDefined()
  await ui.input({ key: 'sheet-path', text: '' })
  await ui.input({ key: 'sprite-path', text: '/nope/missing.png' })
  expect(String(await state($, 'avatarNote'))).toMatch(/^Could not load missing\.png: .*Showing Clawd\.$/)
  expect(await state($, 'avatarFrames')).toBe(null)
  await ui.input({ key: 'frames-per-row', text: 'x' })
  expect(String(await state($, 'avatarNote'))).toMatch(/whole number/)
})

test('the render mode select switches Image and cells, and Reset goes back to Clawd', WITH_PEEK, async ($, on) => {
  const { rec } = await session($, on)
  await $.command.run(cmd('clawd', 'avatar'))
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.select({ key: 'render-mode', value: 'cells' })
  expect(await ui.find({ key: 'avatar-preview' })).toMatchObject({ type: 'Raster' })
  expect(rec.store.get('avatar')).toMatchObject({ mode: 'cells' })
  await ui.input({ key: 'sprite-path', text: '/s/one.png' })
  await ui.press({ key: 'avatar-reset' })
  expect(rec.store.get('avatar')).toEqual({ mode: 'auto', spritePath: '', sheetPath: '', framesPerRow: 4 })
  expect(await ui.find({ key: 'avatar-preview' })).toMatchObject({ type: 'Image' })
})

test('the avatar animates with $.ui.blit while the pane is open; Preview cycles the states', WITH_PEEK, async ($, on) => {
  const { clock, blits } = await session($, on, { TERM_PROGRAM: 'iTerm.app' })
  await $.command.run(cmd('clawd', 'avatar'))
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await clock.advance(1000)
  expect(blits.some(b => b.key === 'avatar-preview' && typeof b.cells === 'string')).toBe(true)
  await ui.press({ key: 'avatar-preview-anim' })
  expect(await state($, 'previewing')).toBe(true)
  const before = blits.length
  await clock.advance(1500)
  expect(blits.length).toBeGreaterThan(before)
  await ui.press({ key: 'tab-home' })
  await clock.advance(1000)
  expect(blits.some(b => b.key === 'avatar-home')).toBe(true)
})

test('each state plays its own sequence: a blink every three seconds, the bulb once a second', () => {
  const idle = Array.from({ length: 18 }, (_, t) => frameAt('idle', t))
  expect(idle.filter(f => f === 2).length).toBe(1)
  expect(Array.from({ length: 6 }, (_, t) => frameAt('thinking', t))).toEqual([0, 0, 0, 1, 1, 1])
})

test('an unchanged frame is not blitted again', WITH_PEEK, async ($, on) => {
  const { clock, blits } = await session($, on, { TERM_PROGRAM: 'iTerm.app' })
  await $.command.run(cmd('clawd', 'home'))
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await clock.advance(3000)
  const home = blits.filter(b => b.key === 'avatar-home')
  expect(home.length).toBeGreaterThan(0)
  expect(home.length).toBeLessThan(6)
  await ui.unmount()
})
