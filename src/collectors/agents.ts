// Subagents: what `agent.spawn` said about each one, what `$.agent.list()`
// says now, and the token counts of its own requests (`turn.step` with its
// `agentId`). Pure. Per-agent cost is not exposed by the engine (only the
// session's total is), so none is kept or drawn.

import type { AgentInfo, AgentSpawnInput, AgentSpawnResult, TurnUsage } from 'claude-code'

import type { AgentRec, AgentStatusWord } from '../../types'
import { EMPTY_TOKENS } from '../state'
import { addStep } from './session'

export type Agents = Record<string, AgentRec>

/** Records a subagent the engine just started. */
export function spawned(agents: Agents, input: AgentSpawnInput, result: AgentSpawnResult, at: number): Agents {
  const id = result.agentId
  if (id === undefined) return agents
  const before = agents[id]
  const rec: AgentRec = {
    ...(before ?? { tokens: EMPTY_TOKENS, startedAt: at, status: 'running' as AgentStatusWord }),
    id,
    description: input.description,
    type: input.subagentType,
    prompt: input.prompt,
    model: result.model,
    background: input.background,
    fork: input.fork,
  }
  if (input.name !== undefined) rec.name = input.name
  if (input.cwd !== undefined) rec.cwd = input.cwd
  if (input.parentAgentId !== undefined) rec.parentId = input.parentAgentId
  return { ...agents, [id]: rec }
}

/** Adds one of a subagent's requests: its tokens, effort and context fill. */
export function stepped(agents: Agents, agentId: string, usage: TurnUsage | null, effort: string | undefined, at: number): Agents {
  const before = agents[agentId] ?? placeholder(agentId, at)
  const rec: AgentRec = { ...before, tokens: addStep(before.tokens, usage) }
  if (effort !== undefined) rec.effort = effort
  if (usage !== null) {
    rec.lastContext = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
    rec.model = rec.model ?? usage.model
  }
  return { ...agents, [agentId]: rec }
}

/** Marks a subagent's run ended (`turn.complete` with its `agentId`). */
export function completed(agents: Agents, agentId: string, at: number, isAborted: boolean): Agents {
  const before = agents[agentId]
  if (before === undefined) return agents
  const status: AgentStatusWord = isAborted ? 'killed' : before.status === 'failed' ? 'failed' : 'completed'
  return { ...agents, [agentId]: { ...before, endedAt: before.endedAt ?? at, status } }
}

/** Merges `$.agent.list()`: its status, names and nesting are the engine's word. */
export function listed(agents: Agents, infos: readonly AgentInfo[], at: number): Agents {
  const next: Agents = { ...agents }
  for (const info of infos) {
    const before = next[info.id] ?? placeholder(info.id, at)
    const rec: AgentRec = {
      ...before,
      description: info.description || before.description,
      type: info.type || before.type,
      status: info.status,
    }
    if (info.name !== undefined) rec.name = info.name
    if (info.parentId !== undefined) rec.parentId = info.parentId
    if (isDone(info.status) && rec.endedAt === undefined) rec.endedAt = at
    if (!isDone(info.status)) delete rec.endedAt
    next[info.id] = rec
  }
  return next
}

/** Records the branch and worktree a subagent's `cwd` is on. */
export function located(agents: Agents, agentId: string, branch: string | undefined, worktree: string | undefined): Agents {
  const before = agents[agentId]
  if (before === undefined) return agents
  const rec: AgentRec = { ...before }
  if (branch !== undefined) rec.branch = branch
  if (worktree !== undefined) rec.worktree = worktree
  return { ...agents, [agentId]: rec }
}

export function isDone(status: AgentStatusWord): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed'
}

export function isActive(status: AgentStatusWord): boolean {
  return status === 'running' || status === 'pending' || status === 'waiting'
}

function placeholder(id: string, at: number): AgentRec {
  return { id, description: '', type: 'agent', status: 'running', startedAt: at, tokens: EMPTY_TOKENS }
}

/** Agents in display order: each parent followed by its children, oldest first. */
export function ordered(agents: Agents): { rec: AgentRec; depth: number }[] {
  const all = Object.values(agents).sort((a, z) => a.startedAt - z.startedAt)
  const ids = new Set(all.map(a => a.id))
  const children = new Map<string, AgentRec[]>()
  const roots: AgentRec[] = []
  for (const a of all) {
    if (a.parentId !== undefined && ids.has(a.parentId)) {
      children.set(a.parentId, [...(children.get(a.parentId) ?? []), a])
    } else {
      roots.push(a)
    }
  }
  const out: { rec: AgentRec; depth: number }[] = []
  const walk = (a: AgentRec, depth: number) => {
    out.push({ rec: a, depth })
    for (const c of children.get(a.id) ?? []) walk(c, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  return out
}

/** The agent's label: the name SendMessage knows it by, else its task's description. */
export function agentLabel(a: AgentRec): string {
  return a.name ?? (a.description || a.id.slice(0, 8))
}

/**
 * Reads `git rev-parse --show-toplevel --git-dir --abbrev-ref HEAD` run in a
 * subagent's `cwd`: its branch, and the worktree's folder name when the `cwd`
 * is a linked worktree (its git dir sits under `.git/worktrees/`).
 */
export function parseLocation(stdout: string): { branch?: string; worktree?: string } {
  const [toplevel, gitDir, branch] = stdout.trim().split('\n')
  const out: { branch?: string; worktree?: string } = {}
  if (branch) out.branch = branch
  if (gitDir && toplevel && /[\\/]worktrees[\\/][^\\/]+$/.test(gitDir)) {
    out.worktree = toplevel.split(/[\\/]/).pop() ?? toplevel
  }
  return out
}

export const LOCATION_ARGV = ['git', 'rev-parse', '--show-toplevel', '--git-dir', '--abbrev-ref', 'HEAD'] as const
