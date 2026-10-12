import { expect, mock, test } from 'claude-code/testing'

import { cmd, paneInput, stubBasics, stubSession, SURFACES } from './kit'
import { show } from './textify'

async function session($: any, on: any) {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, { HOME: '/Users/me' })
  stubBasics(on)
  const fx = stubSession(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  await $.tool.call({ tool: 'Read', file_path: '/w/src/hud/sprite.ts' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/src/hud/panel.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Read', file_path: '/w/package.json' })
  await $.command.run(cmd('clawd', 'context'))
  return { clock, fx }
}

test('Context draws the bar, grid and legend, the lists and the files tree on every surface', async ($, on) => {
  await session($, on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Context · terminal', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^CONTEXT .*142\.0k \/ 200k · 71%$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /■ Messages .*106\.0k 53\.0%$/ })).toBeDefined()
    expect(await ui.find({ key: 'recount' })).toBeDefined()
    expect(await ui.find({ key: 'ctx-mcp' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2 read · 1 edited · 2 untouched/ })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ key: 'ctx-bar' })).toMatchObject({ type: 'Raster', props: { columns: 52, rows: 2 } })
      expect(await ui.find({ key: 'ctx-grid' })).toMatchObject({ type: 'Raster', props: { columns: 19, rows: 10 } })
    }
    await ui.unmount()
  }
})

test('Precise recount asks for a full breakdown; summary otherwise', async ($, on) => {
  const { fx } = await session($, on)
  const before = fx.usageCalls.length
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.press({ key: 'recount' })
  expect(fx.usageCalls.slice(before)).toEqual([{ breakdown: 'full', columns: 100 }])
  expect(fx.usageCalls.slice(0, before).every((c: any) => c === undefined || c.breakdown === 'summary')).toBe(true)
  expect(await ui.find({ type: 'Text', text: /full · updated/ })).toBeDefined()
})

test('sections and tree folders open and close', async ($, on) => {
  await session($, on)
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  expect(await ui.find({ key: 'ctx-mcp-github' })).toBeDefined()
  await ui.press({ key: 'ctx-mcp' })
  expect(await ui.find({ key: 'ctx-mcp-github' })).toBeUndefined()
  await ui.press({ key: 'ctx-skills' })
  expect(await ui.find({ type: 'Text', text: /^ {4}review / })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /panel\.ts/ })).toBeDefined()
  await ui.press({ key: 'tree-src' })
  expect(await ui.find({ type: 'Text', text: /panel\.ts/ })).toBeUndefined()
  await ui.press({ key: 'grid' })
  expect(await ui.find({ key: 'ctx-grid' })).toBeUndefined()
})
