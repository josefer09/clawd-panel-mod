import { expect, mock, test } from 'claude-code/testing'

import { show } from './textify'
import { paneInput, stubBasics, stubSession, SURFACES } from './kit'

const USAGE = { input_tokens: 100, output_tokens: 420, cache_read_input_tokens: 880, cache_creation_input_tokens: 20, model: 'claude-opus-5-5' }

async function session($: any, on: any, overrides = {}) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, { HOME: '/Users/me', TERM_PROGRAM: 'iTerm.app' })
  const rec = stubBasics(on)
  const fx = stubSession(on, overrides)
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* ($: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  return { clock, rec, fx }
}

async function turn($: any, fx: any, id: string, costUsd: number) {
  await $.turn.start({ text: 'go', turnId: id })
  const stream = $.turn.step({ turnId: id, index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1 })
  let step = await stream.next()
  while (step.done !== true) step = await stream.next()
  fx.costUsd = costUsd
  await $.turn.complete({ turnId: id, answer: 'ok', durationMs: 5, isAborted: false, reason: 'answer' })
}

test('Home draws identity, meters, Clawd, the radar and the sparkline on every surface', async ($, on) => {
  const { fx } = await session($, on)
  await turn($, fx, 't1', 4.95)
  await turn($, fx, 't2', 5.36)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    expect(await ui.find({ type: 'Text', text: 'Opus 5.5' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: ' high ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'feat/hud' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '71%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '34%' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$5.36' })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'radar' })).toMatchObject({ type: 'Raster' })
    else expect(await ui.find({ type: 'Svg' })).toBeDefined()
    expect(await ui.find({ key: 'refresh' })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ key: 'avatar-home' })).toMatchObject({ type: 'Raster' })
      expect(await ui.find({ key: 'spark-cells' })).toMatchObject({ type: 'Raster' })
      show('Home · terminal', await ui.drawn())
    }
    await ui.unmount()
  }
})

test('Refresh reads usage and git again', async ($, on) => {
  const { fx, clock } = await session($, on)
  const before = fx.usageCalls.length
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.press({ key: 'refresh' })
  await clock.advance(10)
  expect(fx.usageCalls.length).toBe(before + 1)
})

test('off a subscription the limits read n/a (API key)', async ($, on) => {
  await session($, on, { rateLimits: [] })
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'n/a (API key)' })).toBeDefined()
})

test('at the threshold the context meter turns inverse red', async ($, on) => {
  await session($, on, { percent: 91 })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    const line = await ui.find({ type: 'Text', text: /^CONTEXT {2}/ })
    expect(line?.children?.[0]).toMatchObject({ props: { backgroundColor: '#C83B4A', bold: true }, children: ['CONTEXT  '] })
    await ui.unmount()
  }
})

test('in Ghostty the avatar is an Image of RGBA pixels; in iTerm2 a Raster', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, { TERM_PROGRAM: 'ghostty' })
  stubBasics(on)
  stubSession(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  const img = await ui.find({ key: 'avatar-home' })
  expect(img).toMatchObject({ type: 'Image', props: { columns: 24, rows: 14, source: { width: 96, height: 112 } } })
})
