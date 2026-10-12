// clawd-panel's state contract: every value it keeps in `$.state`, declared
// under the plugin's name. `claude plugin validate` holds each `$.state` key the
// module names to this file. Every value is plain JSON.

export type TabId = 'home' | 'context' | 'agents' | 'git' | 'avatar'

export type AvatarState = 'idle' | 'thinking' | 'tool' | 'done'

/** How the avatar is drawn: an `Image` (kitty graphics), `Raster` half-blocks, or decided per terminal. */
export type RenderMode = 'auto' | 'image' | 'cells'

/** `$.session.usage()` as last read, without the breakdown. */
export type UsageSnap = {
  /** `$.clock.now()` when read. */
  at: number
  /** `usage().startedAt`: when the session these figures count from began. */
  startedAt: number
  /** Input tokens the last response was answered over; absent before the first. */
  contextTokens?: number
  contextWindow: number
  contextPercent?: number
  rateLimits: RateLimitSnap[]
  /** Session total in USD; absent where the host keeps no ledger. */
  costUsd?: number
}

export type RateLimitSnap = { kind: string; percentUsed: number; resetsAt?: string }

/** One /context row. */
export type CategorySnap = {
  name: string
  tokens: number
  /** The theme key /context draws the row in. */
  color: string
  kind: 'used' | 'free' | 'buffer' | 'deferred'
}

/** One /context grid square, reduced to what the grid draws. */
export type GridSquare = { categoryName: string; isFilled: boolean; fullness: number }

export type McpServerSnap = {
  name: string
  tokens: number
  tools: number
  loaded: number
  items: { name: string; tokens: number; isLoaded: boolean }[]
}

/** `$.session.usage({ breakdown })`'s `context.breakdown`, reduced. */
export type BreakdownSnap = {
  at: number
  detail: 'summary' | 'full'
  model: string
  categories: CategorySnap[]
  totalTokens: number
  rawMaxTokens: number
  percentage: number
  grid: GridSquare[][]
  mcpServers: McpServerSnap[]
  memoryFiles: { path: string; type: string; tokens: number }[]
  skills: { total: number; included: number; tokens: number; items: { name: string; tokens: number }[] } | null
  customAgents: { agentType: string; source: string; tokens: number }[]
  autoCompactThreshold?: number
  isAutoCompactEnabled: boolean
}

/** Token counts summed over model requests, as `turn.step` reports them. */
export type TokenTotals = {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  requests: number
}

export type SessionSnap = {
  /** `$.session.model()`. */
  model?: string
  /** The effort of the main loop's last request (`turn.step`'s `e.effort`). */
  effort?: string
  /** `$.session.turns()`. */
  turns: number
  cwd?: string
  /** `$HOME`, to draw paths under it as `~`. */
  home?: string
  /** True between the main loop's `turn.start` and its `turn.complete`. */
  isWorking: boolean
  /** How many times the main conversation was compacted. */
  compactions: number
  lastCompactAt?: number
}

/** Per-turn cost: the session ledger's growth across each main-loop turn. */
export type CostLedger = { turns: number[]; lastTotal?: number }

export type AgentStatusWord = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'

export type AgentRec = {
  id: string
  name?: string
  description: string
  type: string
  status: AgentStatusWord
  parentId?: string
  prompt?: string
  /** What `agent.spawn` resolved the model to. */
  model?: string
  background?: boolean
  fork?: boolean
  cwd?: string
  startedAt: number
  endedAt?: number
  tokens: TokenTotals
  /** The effort of its last request. */
  effort?: string
  /** input + cache read + cache write of its last request: its context fill, in tokens. */
  lastContext?: number
  branch?: string
  worktree?: string
}

/** What the session did to one file, keyed by absolute path. */
export type FileMark = { read: boolean; edited: boolean; agents: string[] }

export type GitChange = { code: string; path: string; added?: number; removed?: number }

export type GitBranch = {
  name: string
  head: string
  track: string
  ageSeconds: number
  isCurrent: boolean
  worktree?: string
}

export type GitLogLine = { graph: string; hash?: string; refs?: string; subject?: string }

export type GitSnap = {
  at: number
  isRepo: boolean
  error?: string
  root?: string
  branch?: string
  head?: string
  ahead?: number
  behind?: number
  modified: number
  staged: number
  untracked: number
  changes: GitChange[]
  branches: GitBranch[]
  worktrees: number
  log: GitLogLine[]
}

/** Tracked files from `git ls-files`, relative to `root`. */
export type TrackedFiles = { root: string; paths: string[] }

export type AvatarConfig = {
  mode: RenderMode
  spritePath: string
  sheetPath: string
  framesPerRow: number
}

/** A custom sprite decoded for Raster drawing: frames per state, each rows of `#RRGGBB` or null. */
export type SpriteFrames = {
  source: string
  width: number
  height: number
  frames: Record<AvatarState, (string | null)[][][]>
}

export type AlertState = { crossed: boolean; dismissed: boolean }

declare module 'claude-code' {
  interface PluginState {
    'clawd-panel': {
      tab: TabId
      expanded: string[]
      showGrid: boolean
      band: boolean
      now: number
      usage: UsageSnap | null
      breakdown: BreakdownSnap | null
      recounting: boolean
      session: SessionSnap
      mainTokens: TokenTotals
      cost: CostLedger
      agents: Record<string, AgentRec>
      files: Record<string, FileMark>
      tracked: TrackedFiles | null
      git: GitSnap | null
      alert: AlertState
      avatar: AvatarConfig
      avatarState: AvatarState
      avatarFrames: SpriteFrames | null
      avatarNote: string
      previewing: boolean
      lifetimeTurns: number
      terminal: string
    }
  }
}
