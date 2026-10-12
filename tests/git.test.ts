import { expect, mock, test } from 'claude-code/testing'

import { cmd, GIT_OUT, paneInput, stubBasics, stubSession, SURFACES } from './kit'
import { show } from './textify'

const LOG = [
  '* \u001f3f9c1e0\u001fHEAD -> feat/hud\u001fradar: half-block fill',
  '* \u001f9b20e7a\u001f\u001fmeters: eighth-block partials',
  '| * \u001f77d1f02\u001fhud/reviewer\u001freview: dirty-row redraw',
  '|/  ',
  '*   \u001f8d31f5a\u001f\u001fmerge main into feat/hud',
  '|\\  ',
  '| * \u001fa81d2c4\u001fmain\u001fci: cache pnpm store',
  '|/  ',
  '* \u001f0b7c442\u001f\u001finit: claude-hud scaffold',
].join('\n')

async function session($: any, on: any, git = GIT_OUT) {
  const clock = mock.clock(on, { now: 1_000_000_000 })
  mock.env(on, {})
  stubBasics(on)
  const fx = stubSession(on, { git })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  await $.command.run(cmd('clawd', 'git'))
  return { clock, fx }
}

test('Git draws the branch, changes, branches with worktrees, and the graph on every surface', async ($, on) => {
  await session($, on, { ...GIT_OUT, log: LOG })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Git · terminal', await ui.drawn())
    const has = async (q: any, label: string) => expect({ label, found: (await ui.find(q)) !== undefined }).toEqual({ label, found: true })
    expect(await ui.find({ key: 'git-refresh' })).toBeDefined()
    await has({ type: 'Text', text: /^⎇ feat\/hud {2}↑2 ↓0 +3f9c1e0$/ }, 'head')
    await has({ type: 'Text', text: '1 modified · 1 staged · 0 untracked' }, 'counts')
    await has({ type: 'Text', text: /^ M {2}src\/hud\/panel\.ts +\+48 −3$/ }, 'change')
    await has({ type: 'Text', text: /^BRANCHES .* 3 local · 1 worktree$/ }, 'branches')
    await has({ type: 'Text', text: /hud\/reviewer +▣ reviewer/ }, 'worktree')
    await has({ type: 'Text', text: /^● +3f9c1e0 \(feat\/hud\) radar: half-block fill/ }, 'log head')
    await has({ type: 'Text', text: /^│ ● +77d1f02 \(hud\/reviewer\) review: dirty-row/ }, 'log lane')
    await has({ type: 'Text', text: /^├─╯/ }, 'joint')
    await ui.unmount()
  }
})

test('Refresh runs git again; outside a repository the tab says so', async ($, on) => {
  const { fx, clock } = await session($, on, {})
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'Not a git repository.' })).toBeDefined()
  fx.git = GIT_OUT
  await ui.press({ key: 'git-refresh' })
  await clock.advance(10)
  expect(await ui.find({ type: 'Text', text: /^⎇ feat\/hud/ })).toBeDefined()
})
