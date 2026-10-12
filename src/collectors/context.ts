// The context window by category: `$.session.usage({ breakdown })`'s
// `context.breakdown`, the same estimates /context draws, reduced to what the
// Context tab shows. Pure.

import type { SessionContextBreakdown } from 'claude-code'

import type { BreakdownSnap, GridSquare, McpServerSnap } from '../../types'

/** The grid width the engine is asked for: 80 or more gets the full 10 (or 20) wide grid. */
export const GRID_COLUMNS = 100

export function reduceBreakdown(b: SessionContextBreakdown, detail: 'summary' | 'full', at: number): BreakdownSnap {
  const servers = new Map<string, McpServerSnap>()
  for (const tool of b.mcpTools) {
    const s = servers.get(tool.serverName) ?? { name: tool.serverName, tokens: 0, tools: 0, loaded: 0 }
    s.tools += 1
    if (tool.isLoaded) {
      s.loaded += 1
      s.tokens += tool.tokens
    }
    servers.set(tool.serverName, s)
  }
  const grid: GridSquare[][] = b.gridRows.map(row =>
    row.map(sq => ({ categoryName: sq.categoryName, isFilled: sq.isFilled, fullness: sq.squareFullness })),
  )
  const snap: BreakdownSnap = {
    at,
    detail,
    model: b.model,
    categories: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    totalTokens: b.totalTokens,
    rawMaxTokens: b.rawMaxTokens,
    percentage: b.percentage,
    grid,
    mcpServers: [...servers.values()].sort((a, z) => z.tokens - a.tokens),
    memoryFiles: b.memoryFiles.map(f => ({ path: f.path, type: f.type, tokens: f.tokens })),
    skills: b.skills
      ? {
          total: b.skills.totalSkills,
          included: b.skills.includedSkills,
          tokens: b.skills.tokens,
          items: b.skills.skillFrontmatter.map(s => ({ name: s.name, tokens: s.tokens })),
        }
      : null,
    customAgents: b.agents.map(a => ({ agentType: a.agentType, source: a.source, tokens: a.tokens })),
    isAutoCompactEnabled: b.isAutoCompactEnabled,
  }
  if (b.autoCompactThreshold !== undefined) snap.autoCompactThreshold = b.autoCompactThreshold
  return snap
}

/** The categories the stacked bar draws: the window's content, free space and buffer, deferred schemas left out. */
export function barCategories(b: BreakdownSnap) {
  return b.categories.filter(c => c.kind !== 'deferred' && c.tokens > 0)
}

/** Tokens one grid square stands for. */
export function tokensPerSquare(b: BreakdownSnap): number {
  const squares = b.grid.reduce((n, row) => n + row.length, 0)
  return squares > 0 ? b.rawMaxTokens / squares : 0
}

/** Total tokens of a list of rows. */
export function sumTokens(rows: readonly { tokens: number }[]): number {
  return rows.reduce((n, r) => n + r.tokens, 0)
}
