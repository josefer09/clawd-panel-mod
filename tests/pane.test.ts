import { expect, test } from 'claude-code/testing'

import { cmd, paneInput, stubBasics, SURFACES } from './kit'

test('/clawd toggles the pane, focused and closed by Escape', async ($, on) => {
  const rec = stubBasics(on)
  await $.command.run(cmd('clawd', ''))
  expect(rec.opened).toEqual([{ id: 'clawd', title: 'Claude HUD', focus: true, closeOnEscape: true, columns: 56 }])
  await $.command.run(cmd('clawd', ''))
  expect(rec.closed).toMatchObject([{ id: 'clawd' }])
})

test('/clawd <tab> opens the pane on that tab', async ($, on) => {
  stubBasics(on)
  await $.command.run(cmd('clawd', 'git'))
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /git — not drawn yet/ })).toBeDefined()
})

test('/clawd with an unknown tab says which tabs there are', async ($, on) => {
  stubBasics(on)
  const answer = await $.command.run(cmd('clawd', 'nope'))
  expect(answer.text).toBe('Unknown tab "nope". Tabs: home, context, agents, git, avatar.')
})

test('the tab buttons switch tabs on every surface', async ($, on) => {
  stubBasics(on)
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    expect(await ui.find({ key: 'tab-home' })).toBeDefined()
    await ui.press({ key: 'tab-context' })
    expect(await ui.find({ type: 'Text', text: /^CONTEXT / })).toBeDefined()
    await ui.press({ key: 'tab-home' })
    await ui.unmount()
  }
})

test('/clawd-band toggles the band and keeps the choice in the store', async ($, on) => {
  const rec = stubBasics(on)
  await $.command.run(cmd('clawd-band', ''))
  expect(rec.store.get('band')).toBe(true)
  await $.command.run(cmd('clawd-band', ''))
  expect(rec.store.get('band')).toBe(false)
})
