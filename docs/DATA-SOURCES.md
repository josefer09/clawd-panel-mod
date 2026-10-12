# Data sources

Every figure the HUD draws, where it comes from, and when it is read. All of
it is what Claude Code itself reports through the mods API, or git's own
output. The mod never estimates, extrapolates or prices tokens: where the API
exposes no figure, the HUD draws `—` or `n/a`.

Verified against the declarations Claude Code 2.1.296 writes
(`.claude/types/claude-code.d.ts`). Collectors live in `src/collectors/` (pure
parsing and reducing); `src/engine.tsx` makes the calls.

## Usage (Home, band)

| Figure | Source | Read when |
| --- | --- | --- |
| Context tokens / window / % | `$.session.usage().context`: `tokens`, `window`, `percent` (the status line's `total_input_tokens`, `context_window_size`, `used_percentage`) | `session.start`; every main-loop `turn.complete`; `session.measure` (its input carries the same figures, no call) |
| 5h and weekly limits, reset times | `usage().rateLimits[]`: `kind` `five_hour` / `seven_day`, `percentUsed`, `resetsAt` (ISO 8601) | same |
| Session cost (USD) | `usage().cost.usd`: the session's cost ledger, as `/cost` totals it | same |
| Session start (duration) | `usage().startedAt` (ms, `$.clock.now()` scale; a resumed session's first launch; `/clear` restarts it) | same |
| Model | `$.session.model()` (as `/model` shows it) | `session.start`, each main-loop `turn.complete`, after a reset |
| Turns | `$.session.turns()` (user turns in the transcript) | same |
| Effort | `turn.step`'s `e.effort` on the main loop (no `agentId`); `—` until the first request | each main-loop request |
| Tokens per request (in / out / cache read / cache write) | `turn.step`: `const r = yield* next(e)`, `r.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`) | each request |

`rateLimits` is empty off a subscription (an API key, a cloud provider): the
5h and weekly rows then read `n/a (API key)`.

### Derived figures (ratios of reported numbers, nothing estimated)

| Figure | Formula | Inputs |
| --- | --- | --- |
| Cache hit % (radar) | `cacheRead / (input + cacheRead + cacheWrite)` | main-loop `turn.step` usage, summed over the session |
| Out/In (radar) | `output / (input + cacheRead + cacheWrite)` | same |
| Cost per turn (sparkline) | growth of `usage().cost.usd` between consecutive main-loop `turn.complete`s; the first turn counts from the ledger at `session.start` (a resumed session's earlier spend is not attributed to it) | `usage().cost.usd` |
| Average per turn | session cost / turns | `cost.usd`, `turns()` |
| Level (`Lv.`) | `⌊√(lifetime turns)⌋`, lifetime turns counted by this mod across sessions (`$.store`) | main-loop `turn.complete` count |

A subagent running in the background is billed into the session ledger
whenever its requests complete, so its cost lands in whichever main-loop turn
ends next. Per-subagent USD is **not exposed** by the API and is never drawn.

## Context (Context tab)

| Figure | Source | Read when |
| --- | --- | --- |
| Categories, grid, MCP tools by server, memory files, skills, custom agents, autocompact threshold | `$.session.usage({ breakdown: 'summary', columns: 100 }).context.breakdown` | `session.start`, each main-loop `turn.complete`, after a compaction |
| Precise recount | the same call with `breakdown: 'full'`, which sends one token-count request per tool and memory file (as `/context` does) | only on the **Precise recount** button |

These are Claude Code's own per-category estimates, exactly the rows `/context`
prints; the tab labels them as `/context` does and stamps them `summary` or
`full` with their age. MCP tools are grouped by `serverName`; a server's
tokens are its loaded tools' (deferred schemas are outside the window).

## Files (Context tab, agent rows)

| Figure | Source |
| --- | --- |
| Read / edited files | `tool.call` for `Read` (read) and `Edit`, `Write`, `NotebookEdit` (edited): `file_path` (`notebook_path` for NotebookEdit), and `e.agentId` (absent on the main loop). Counted once the call returns without `deny` or `isError`. |
| Untouched files | `git ls-files -z` (via `$.process.run`, at most 20,000 paths) minus the touched set |

`Grep`, `Glob` and `Bash` are searches and commands, not consumption of a
file, and are not counted. **Tokens per file are not exposed** and are not
drawn.

## Subagents (Agents tab)

| Figure | Source |
| --- | --- |
| List, status, name, description, type, parent | `$.agent.list()`: `id`, `name`, `description`, `type`, `status`, `parentId` — read at `session.start`, each `turn.complete` (main or subagent) and every 10 s while one is active |
| Task prompt, model, background, fork, cwd | `agent.spawn`: `const r = await next(e)`; the input's `prompt`, `background`, `fork`, `cwd`, `name`, `parentAgentId`, and `r.model`, keyed by `r.agentId` |
| Tokens, effort, requests | `turn.step` with `e.agentId`, summed per agent |
| Context fill | `input + cache_read + cache_creation` of its **last** request, in tokens (no %: a subagent's window is not exposed) |
| Done | `turn.complete` with `e.agentId` (`isAborted` → killed), then the engine's status from `agent.list()` |
| Branch / worktree | `git rev-parse --show-toplevel --git-dir --abbrev-ref HEAD` run in the subagent's `cwd`; a git dir under `.git/worktrees/` marks a linked worktree |
| Elapsed time | from `agent.spawn` to its end (clock), ticking while it runs |

## Git (Git tab, Home, band)

All via `$.process.run` (argv, no shell) in the session's directory, refreshed
at `session.start` and 1.5 s after each main-loop `turn.complete` (one run per
burst), or on **Refresh**:

| Figure | Command |
| --- | --- |
| Repository root | `git rev-parse --show-toplevel` |
| Branch, head, ahead/behind, modified / staged / untracked, changed paths | `git status --porcelain=v2 --branch` |
| Lines added/removed | `git diff --numstat HEAD` |
| Local branches, upstream track, age, worktree | `git for-each-ref refs/heads` with `%(upstream:track)`, `%(committerdate:unix)`, `%(HEAD)`, `%(worktreepath)` |
| Commit graph | `git log --graph --all --date-order --decorate=short -n 13` |

## Compaction

`session.compact` (main loop, a real compaction, not `precompute` and not
skipped) counts one; `classic.SessionStart` with `source: 'compact'` re-reads
usage and the breakdown, since the window changed.

## Session resets

`/clear`, `/resume` and `/branch` reset `$.state`. `classic.SessionStart` with
`source` `clear`, `resume` or `fork` reads everything again and copies the
`$.store` values back (avatar settings, band on/off, lifetime turns).

## Terminal

`$.env.get` of `TERM_PROGRAM`, `TERM`, `TMUX`, `STY`, `KITTY_WINDOW_ID`,
`GHOSTTY_RESOURCES_DIR` and `CLAUDE_CODE_FORCE_TERMINAL_IMAGES` names the
terminal and decides whether an `Image` draws pixels (kitty or Ghostty, not
inside tmux or screen, or forced).
