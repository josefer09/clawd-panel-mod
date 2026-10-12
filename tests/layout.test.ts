import { expect, mock, test } from 'claude-code/testing'

import { cmd, paneInput, stubBasics, stubSession, SURFACES } from './kit'
import { show } from './textify'

const BAND = {
  plugin: 'clawd-panel',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 200, rows: 50, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 195, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

async function session($: any, on: any, overrides = {}) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, { HOME: '/Users/me', TERM_PROGRAM: 'iTerm.app' })
  const rec = stubBasics(on)
  const fx = stubSession(on, overrides)
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const compactions: unknown[] = []
  on('session.compact', ($: any, e: any) => {
    compactions.push(e)
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] }
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  return { clock, rec, fx, compactions }
}

test('the band is off until /clawd-band, then draws the strip; its button opens the HUD', async ($, on) => {
  const { rec } = await session($, on)
  const off = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await off.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  await off.unmount()
  await $.command.run(cmd('clawd-band'))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    if (surface === 'terminal') show('Band · terminal', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /⎇ feat\/hud · Opus 5\.5 · — · ctx 71% .* · 5h 34% · \$4\.82/ })).toBeDefined()
    expect(await ui.find({ key: 'band-open' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'band-open' })
  expect(rec.opened.length).toBe(1)
})

test('at the threshold the band shows ctx in inverse red', async ($, on) => {
  await session($, on, { percent: 91 })
  await $.command.run(cmd('clawd-band'))
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const line = await ui.find({ type: 'Text', text: /ctx 91%/ })
  expect(JSON.stringify(line)).toContain('{"color":"#E8E4E0","backgroundColor":"#C83B4A","bold":true},"children":["91%"]')
})

test('above the prompt, Home lays out in three columns from 116 cells, one below', async ($, on) => {
  await session($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput('inline', 116, 14), surface })
    if (surface === 'terminal') show('Home · inline 116', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^STATS / })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^CLAWD .* Lv\. 0$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /↻ / })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'avatar-mini' })).toMatchObject({ type: 'Raster', props: { columns: 12, rows: 7 } })
    await ui.unmount()
  }
  const narrow = await $.ui.mount({ ...paneInput('inline', 80, 14), surface: 'terminal' })
  expect(await narrow.find({ type: 'Text', text: /^STATS / })).toBeUndefined()
  expect(await narrow.find({ type: 'Text', text: /^USAGE / })).toBeDefined()
})

test('the alert banner stands at the threshold until dismissed; /compact now compacts', async ($, on) => {
  const { compactions } = await session($, on, { percent: 91 })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Alert · terminal', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^▲ Context at 91% — compaction soon/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '182k / 200k · auto-compact at 95%' })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.press({ key: 'alert-compact' })
  expect(compactions.length).toBe(1)
  expect(await ui.find({ key: 'alert-dismiss' })).toBeUndefined()
})

test('every tab draws on all four surfaces, Raster and Image only on the terminal', async ($, on) => {
  await session($, on)
  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    for (const tab of ['home', 'context', 'agents', 'git', 'avatar']) {
      await $.command.run(cmd('clawd', tab))
      const ui = await $.ui.mount({ ...paneInput(), surface })
      expect(await ui.find({ key: `tab-${tab}` })).toBeDefined()
      const drawn = JSON.stringify(await ui.drawn())
      if (surface !== 'terminal') expect(/"type":"(Raster|Image)"/.test(drawn)).toBe(false)
      if (surface === 'mobile') expect(/"type":"(Input|Select)"/.test(drawn)).toBe(false)
      await ui.unmount()
    }
  }
})
