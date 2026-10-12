import { expect, mock, test } from 'claude-code/testing'

import { state, stubBasics, stubSession, WITH_PEEK } from './kit'

const USAGE = { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 800, cache_creation_input_tokens: 100, model: 'claude-opus-5-5' }

test('session.start reads usage, the breakdown, the session, git and the terminal', WITH_PEEK, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, { TERM_PROGRAM: 'ghostty' })
  stubBasics(on)
  stubSession(on)
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await clock.advance(2000)
  expect(await state($, 'usage')).toMatchObject({ contextTokens: 142000, contextPercent: 71, costUsd: 4.82 })
  expect(await state($, 'breakdown')).toMatchObject({ detail: 'summary', rawMaxTokens: 200000 })
  expect(await state($, 'session')).toMatchObject({ model: 'Opus 5.5', turns: 37, cwd: '/w', isWorking: false })
  expect(await state($, 'terminal')).toBe('ghostty +img')
  expect(await state($, 'git')).toMatchObject({ isRepo: true, branch: 'feat/hud', ahead: 2, modified: 1, staged: 1 })
  expect(await state($, 'tracked')).toMatchObject({ root: '/w' })
  expect(await state($, 'cost')).toEqual({ turns: [], lastTotal: 4.82 })
})

test('turn.step adds the main loop\'s tokens and effort, and a subagent\'s to its own record', WITH_PEEK, async ($, on) => {
  mock.clock(on)
  stubBasics(on)
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: USAGE }
  })
  for (const agentId of [undefined, 'a1']) {
    const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, ...(agentId ? { agentId } : {}) })
    let step = await stream.next()
    while (step.done !== true) step = await stream.next()
  }
  expect(await state($, 'mainTokens')).toEqual({ input: 100, output: 40, cacheRead: 800, cacheWrite: 100, requests: 1 })
  expect(await state($, 'session')).toMatchObject({ effort: 'high' })
  expect(await state($, 'agents')).toMatchObject({ a1: { tokens: { requests: 1 }, lastContext: 1000, effort: 'high' } })
})

test('a turn ends: cost per turn, the alert toast once, lifetime turns, avatar done then idle', WITH_PEEK, async ($, on) => {
  const clock = mock.clock(on, { now: 1_000_000 })
  mock.env(on, {})
  const rec = stubBasics(on)
  const fx = stubSession(on, { percent: 50, costUsd: 1 })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  await $.session.start({ cwd: '/w', surface: 'terminal', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(await state($, 'session')).toMatchObject({ isWorking: true })
  fx.percent = 91
  fx.costUsd = 1.25
  await $.turn.complete({ turnId: 't1', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' })
  expect(await state($, 'cost')).toEqual({ turns: [0.25], lastTotal: 1.25 })
  expect(rec.toasts).toEqual(['▲ Context at 91% — compaction soon'])
  expect(await state($, 'avatarState')).toBe('done')
  expect(rec.store.get('lifetimeTurns')).toBe(1)
  await $.turn.complete({ turnId: 't2', answer: 'done', durationMs: 10, isAborted: false, reason: 'answer' })
  expect(rec.toasts.length).toBe(1)
  await clock.advance(5000)
  expect(await state($, 'avatarState')).toBe('idle')
})

test('file tools mark files read or edited, per loop; other tools do not', WITH_PEEK, async ($, on) => {
  mock.clock(on)
  stubBasics(on)
  on('tool.call', () => ({ result: 'ok' }))
  await $.tool.call({ tool: 'Read', file_path: '/w/src/a.ts' })
  await $.tool.call({ tool: 'Write', file_path: '/w/src/b.ts', content: 'x' })
  await $.tool.call({ tool: 'Bash', command: 'cat /w/src/c.ts' })
  expect(await state($, 'files')).toEqual({
    '/w/src/a.ts': { read: true, edited: false, agents: [''] },
    '/w/src/b.ts': { read: false, edited: true, agents: [''] },
  })
})

test('agent.spawn keeps the task, model, background, fork and cwd under the new agent id', WITH_PEEK, async ($, on) => {
  const clock = mock.clock(on, { now: 5000 })
  stubBasics(on)
  stubSession(on)
  on('agent.spawn', () => ({ model: 'claude-sonnet-5-5', agentId: 'a1' }))
  await $.agent.spawn({
    tool_use_id: 'tu',
    prompt: 'Review src/hud/',
    description: 'Review render loop',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    name: 'reviewer',
    cwd: '/w/.worktrees/reviewer',
  })
  await clock.advance(10)
  expect(await state($, 'agents')).toMatchObject({
    a1: {
      name: 'reviewer',
      type: 'general-purpose',
      prompt: 'Review src/hud/',
      model: 'claude-sonnet-5-5',
      background: true,
      fork: false,
      cwd: '/w/.worktrees/reviewer',
      startedAt: 5000,
      branch: 'hud/reviewer',
      worktree: 'reviewer',
    },
  })
})

test('a compaction is counted; /clear reads everything again and restores stored settings', WITH_PEEK, async ($, on) => {
  mock.clock(on)
  mock.env(on, {})
  const rec = stubBasics(on)
  stubSession(on)
  on('session.compact', ($, e) => ({ messages: e.messages }))
  on('classic.SessionStart', () => ({}))
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hi', toolUses: [] }] })
  expect(await state($, 'session')).toMatchObject({ compactions: 1 })
  rec.store.set('band', true)
  await $.classic.SessionStart({ source: 'clear' })
  expect(await state($, 'band')).toBe(true)
  expect(await state($, 'usage')).toMatchObject({ contextPercent: 71 })
})

test('session.measure updates the figures without a call', WITH_PEEK, async ($, on) => {
  mock.clock(on)
  stubBasics(on)
  on('session.measure', ($, e) => ({ changed: e.changed }))
  await $.session.measure({ context: { window: 200000, tokens: 20000, percent: 10 }, rateLimits: [], changed: ['context'] })
  expect(await state($, 'usage')).toMatchObject({ contextPercent: 10, rateLimits: [] })
})
