# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-10-11

### Added

- Band above the prompt (board 2c), toggled by `/clawd-band`: branch, model, effort, context with its bar, the 5h window and cost on the panel surface; `/clawd open HUD` opens the pane.
- Inline layout (board 2b): with the pane above the prompt, Home draws three columns from 116 cells (usage with `↻` resets and a one-row cost sparkline, the r = 7 radar, Clawd at half size), the left column alone below that.
- Context alert (board 2a): a banner at the top of the pane with `[ /compact now ]` (`$.session.compact()`) and `[ Dismiss ]`, beside the toast once per crossing.
- Every tab draws on the terminal, desktop, VS Code and mobile surfaces; Raster and Image only on the terminal, Input and Select nowhere on mobile.
- README with install via the marketplace and `--plugin-dir`, settings and local checks; LICENSE.

### Changed

- Clawd plays a sequence per state (a blink every three seconds, the bulb pulsing once a second, the hammer, the heart); an unchanged frame is not sent again.
- The post-turn reads run on a timer after `turn.complete`, so the turn ends at once.
- Lifetime turns re-read `$.store` before writing, so sessions add up instead of overwriting each other.
- Clawd keeps the tool pose until the last of parallel tool calls ends.

## [0.6.0] - 2026-10-11

### Added

- Avatar tab (board 1f): the preview with state, frame, canvas, cells, fps and source; the four state frames with the current one marked; sprite path, sheet and frames-per-row fields; the render-mode select with the detected terminal; Reset to Clawd and Preview animation.
- Sprite pipeline: a dependency-free PNG decoder (inflate and row filters), sprite sheets cut per state and fitted to 24×28, only paths kept in `$.store`.
- Animation at 6 fps with `$.ui.blit` for the Home avatar and the preview, Image (kitty graphics) or Raster cells per the render mode.
- `assets/`: Clawd's sprite sheet and per-state PNGs, rendered from the ported sprites by `scripts/build-assets.ts`.

## [0.5.0] - 2026-10-11

### Added

- Git tab (board 1e): branch with ahead/behind and head, dirty counts, changed files with lines added and removed, local branches with upstream track, worktree marks and age, and the commit graph in the mockup's glyphs, colored by lane.

## [0.4.0] - 2026-10-11

### Added

- Agents tab (board 1c): totals header, an accordion of subagents with status chips, tokens and elapsed time; expanded rows show model, effort, branch and worktree, cwd, background, fork, parent, token breakdown, context fill, the task prompt (three lines and `[ more ]`) and a files-touched tree; children nest under their parent; the chip legend.
- Empty state (board 1d): Clawd, "No party members deployed." and "Agents will appear here when Claude launches them."

## [0.3.0] - 2026-10-11

### Added

- Context tab (board 1b): stacked category bar with axis, the /context grid beside its legend (`■ = Nk tokens`), Precise recount (a `full` breakdown) with an `updated Ns ago` stamp, a grid toggle, and expandable MCP (per server, per tool), memory, skills and custom-agent lists.
- Files tree: read / edited / untouched marks, folders open where something was touched, collapsed folders with counts, folders toggle by press.

## [0.2.0] - 2026-10-11

### Added

- Home tab (board 1a): identity rows, usage meters with reset times, cost line, Clawd with glow, level and state, the five-axis stats radar, and the cost-per-turn sparkline.
- Raster pipeline: cell packing, half-block pixels, a cell canvas, the radar (ported from the mockup's `radar()`), the sparkline (`spark()`), and Clawd's four sprites (`sprite()`) with animation frames.
- Desktop fallbacks: Svg avatar and radar, text sparkline.
- Context meter turns inverse red at the alert threshold.

## [0.1.0] - 2026-10-11

### Added

- Collectors (pure) for usage, the /context breakdown, subagents, files, git and the terminal, with unit tests.
- Engine hooks: `session.start`, `session.measure`, `session.compact`, `turn.start`, `turn.step`, `turn.complete`, `tool.call`, `agent.spawn`, and `classic.SessionStart` (re-reads after `/clear`, `/resume`, `/branch` and compaction).
- Context alert toast, once per crossing of the threshold.
- `docs/DATA-SOURCES.md`: every figure, its API source and when it is read.

## [0.0.0] - 2026-10-11

### Added

- Scaffold: manifest with `userConfig` (title, theme, alert threshold, docked width), marketplace file, hooks module.
- `/clawd` toggles the pane (focused, closed by Esc); `/clawd <tab>` opens it on a tab; `/clawd-band` toggles the band setting.
- Pane chrome from the mockup: header, five tab buttons on hotkeys 1–5, rules, shortcut footer.
- Color tokens from the Alrest design system (`pyra`, `pyra-light`) in `src/theme.ts`.
- Local check script, type declarations for Claude Code 2.1.296.
