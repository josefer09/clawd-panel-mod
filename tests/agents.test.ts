import { expect, mock, test } from 'claude-code/testing'

import { cmd, paneInput, stubBasics, stubSession, SURFACES } from './kit'
import { show } from './textify'

const STEP = { input_tokens: 31400, output_tokens: 6800, cache_read_input_tokens: 118200, cache_creation_input_tokens: 12100, model: 'claude-sonnet-5-5' }
const PROMPT =
  'Review src/hud/ for render-loop regressions after the radar change. Confirm each frame redraws only dirty rows and that resizing keeps the 56-col dock intact, then report.'

function spawn(id: string, name: string, type: string, extra: Record<string, unknown> = {}) {
  return {
    tool_use_id: `tu-${id}`,
    prompt: PROMPT,
    description: `${name} task`,
    subagentType: type,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    name,
    ...extra,
  } as const
}

test('with no subagent the Agents tab shows the empty state, as in the mockup', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, {})
  stubBasics(on)
  stubSession(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.command.run(cmd('clawd', 'agents'))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Agents · empty', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^AGENTS .* 0 agents$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /No party members deployed\.$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Agents will appear here when Claude launches them\.$/ })).toBeDefined()
    if (surface === 'terminal') expect(await ui.find({ key: 'avatar-empty' })).toMatchObject({ type: 'Raster', props: { columns: 44, rows: 18 } })
    await ui.unmount()
  }
})

test('the accordion: totals, a nested child, details, more, files, and toggles', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-10-11T20:00:00Z') })
  mock.env(on, { HOME: '/Users/me' })
  stubBasics(on)
  const fx = stubSession(on)
  let next = 0
  const ids = ['a1', 'a2', 'a3']
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: ids[next++] }))
  on('tool.call', () => ({ result: 'ok' }))
  on('turn.complete', () => ({ text: '' }))
  on('turn.step', async function* ($: any, e: any) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: STEP }
  })
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(spawn('a1', 'reviewer', 'general-purpose', { cwd: '/w/.worktrees/reviewer' }))
  await clock.advance(10)
  await $.agent.spawn(spawn('a2', 'scout', 'Explore', { parentAgentId: 'a1' }))
  await $.agent.spawn(spawn('a3', 'planner', 'Plan'))
  for (const agentId of ['a1', 'a1']) {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-sonnet-5-5', effort: 'high', messageCount: 3, agentId })
    let step = await stream.next()
    while (step.done !== true) step = await stream.next()
  }
  await $.tool.call({ tool: 'Read', file_path: '/w/src/hud/panel.ts', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Edit', file_path: '/w/src/hud/render-loop.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  fx.agents = [
    { id: 'a1', description: 'reviewer task', type: 'general-purpose', status: 'running', name: 'reviewer' },
    { id: 'a2', description: 'scout task', type: 'Explore', status: 'running', parentId: 'a1', name: 'scout' },
    { id: 'a3', description: 'planner task', type: 'Plan', status: 'completed', name: 'planner' },
  ]
  await clock.advance(252_000)
  await $.turn.complete({ turnId: 'p', answer: 'plan', durationMs: 1, isAborted: false, reason: 'answer', agentId: 'a3' })
  await $.command.run(cmd('clawd', 'agents'))
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...paneInput(), surface })
    if (surface === 'terminal') show('Agents · accordion', await ui.drawn())
    expect(await ui.find({ type: 'Text', text: /^AGENTS .* 3 agents · 2 running · .* tokens$/ })).toBeDefined()
    expect(await ui.find({ key: 'agent-a1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Sonnet 5\.5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /hud\/reviewer {2}▣ worktree/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^in 62\.8k {2}out 13\.6k {2}cache r 236\.4k {2}w 24\.2k$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /last request · 2 requests/ })).toBeDefined()
    expect(await ui.find({ key: 'agent-more-a1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1 read · 1 edited/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / completed / })).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ ...paneInput(), surface: 'terminal' })
  await ui.press({ key: 'agent-more-a1' })
  expect(await ui.find({ type: 'Text', text: /then report\.$/ })).toBeDefined()
  await ui.press({ key: 'agent-a1' })
  expect(await ui.find({ key: 'agent-more-a1' })).toBeUndefined()
  await ui.press({ key: 'agent-a3' })
  expect(await ui.find({ type: 'Text', text: /main session/ })).toBeDefined()
})
