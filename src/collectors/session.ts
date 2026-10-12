// Session figures: what `$.session.usage()`, `session.measure` and
// `turn.step` report, reduced into the snapshots the drawings read. Pure: the
// engine asks, these shape the answers. Nothing here estimates or prices
// tokens: every number is one the engine reported, or a sum or ratio of them.

import type { SessionContextUsage, SessionCost, SessionRateLimit, TurnUsage } from 'claude-code'

import type { AlertState, CostLedger, RateLimitSnap, TokenTotals, UsageSnap } from '../../types'

/** What `usage()` and `session.measure` share. */
export type UsageLike = {
  context: SessionContextUsage
  rateLimits: readonly SessionRateLimit[]
  cost?: SessionCost
}

/** `usage()`'s figures as a snapshot; `startedAt` from the call, or kept from the last one. */
export function snapshotUsage(u: UsageLike, at: number, startedAt: number): UsageSnap {
  const snap: UsageSnap = {
    at,
    startedAt,
    contextWindow: u.context.window,
    rateLimits: u.rateLimits.map(r => {
      const limit: RateLimitSnap = { kind: r.kind, percentUsed: r.percentUsed }
      if (r.resetsAt !== undefined) limit.resetsAt = r.resetsAt
      return limit
    }),
  }
  if (u.context.tokens !== undefined) snap.contextTokens = u.context.tokens
  if (u.context.percent !== undefined) snap.contextPercent = u.context.percent
  if (u.cost !== undefined) snap.costUsd = u.cost.usd
  return snap
}

export function rateLimit(snap: UsageSnap | null, kind: 'five_hour' | 'seven_day'): RateLimitSnap | undefined {
  return snap?.rateLimits.find(r => r.kind === kind)
}

/** Adds one request's usage, as `turn.step` reported it, to a running total. */
export function addStep(totals: TokenTotals, usage: TurnUsage | null): TokenTotals {
  if (usage === null) return totals
  return {
    input: totals.input + usage.input_tokens,
    output: totals.output + usage.output_tokens,
    cacheRead: totals.cacheRead + usage.cache_read_input_tokens,
    cacheWrite: totals.cacheWrite + usage.cache_creation_input_tokens,
    requests: totals.requests + 1,
  }
}

/** All the input a request was answered over: uncached, cache-read and cache-written. */
export function totalInput(t: TokenTotals): number {
  return t.input + t.cacheRead + t.cacheWrite
}

/** Cache hit: cache-read input over all input. Undefined before any input. */
export function cacheHit(t: TokenTotals): number | undefined {
  const all = totalInput(t)
  return all > 0 ? t.cacheRead / all : undefined
}

/** Output tokens over all input tokens. Undefined before any input. */
export function outIn(t: TokenTotals): number | undefined {
  const all = totalInput(t)
  return all > 0 ? t.output / all : undefined
}

/** `turn.step`'s effort as a word: a level, or a budget written as a number. */
export function effortWord(effort: string | number | undefined): string | undefined {
  if (effort === undefined) return undefined
  return String(effort)
}

/** How many turns' costs the sparkline keeps. */
export const COST_TURNS = 200

/**
 * Records the cost of the turn that just ended: the growth of the session's
 * cost ledger since the last turn ended (or since the session started).
 */
export function recordCost(ledger: CostLedger, totalUsd: number | undefined): CostLedger {
  if (totalUsd === undefined) return ledger
  const spent = Math.max(0, totalUsd - (ledger.lastTotal ?? 0))
  return { turns: [...ledger.turns, spent].slice(-COST_TURNS), lastTotal: totalUsd }
}

/** Sets the baseline the first turn's cost is counted from: what a resumed session had already spent. */
export function baselineCost(ledger: CostLedger, totalUsd: number | undefined): CostLedger {
  if (ledger.lastTotal !== undefined || totalUsd === undefined) return ledger
  return { ...ledger, lastTotal: totalUsd }
}

/**
 * The context alert: on once the fill reaches the threshold, off again below
 * it. `toast` is true exactly once per crossing.
 */
export function alertStep(alert: AlertState, percent: number | undefined, threshold: number): { next: AlertState; toast: boolean } {
  if (percent === undefined) return { next: alert, toast: false }
  if (percent >= threshold) {
    if (alert.crossed) return { next: alert, toast: false }
    return { next: { crossed: true, dismissed: false }, toast: true }
  }
  if (!alert.crossed) return { next: alert, toast: false }
  return { next: { crossed: false, dismissed: false }, toast: false }
}

export function alertText(percent: number): string {
  return `▲ Context at ${Math.round(percent)}% — compaction soon`
}
