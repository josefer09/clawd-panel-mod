# Deviations

Every place the mod differs from the brief or from the mockup
(`Claude HUD Mockup.dc.html`), why, and what it does instead. Grouped by
screen; the first group covers the build itself.

## Build and architecture

### `/plugin-types` does not exist in this build

- **Brief**: run `/plugin-types` to generate `.claude/types/claude-code.d.ts`.
- **Why not**: Claude Code 2.1.296 has no such command. The engine writes the
  declarations itself: the `plugin-authoring` skill lays them out when it
  loads, and a mod loaded from a watched folder gets them under
  `.claude-plugin/types/`.
- **Instead**: `.claude/types/claude-code.d.ts` is the file 2.1.296 wrote
  (first line: `// Written by Claude Code 2.1.296.`), committed so `tsc` runs
  anywhere. `.claude-plugin/types/` is git-ignored.

### `$` stays in one file: `src/engine.tsx`

- **Brief**: collectors in `src/collectors/*.ts` gather data in event hooks;
  `src/state.ts` holds the atoms; `hooks/register.ts` is wiring only.
- **Why not as drawn**: the engine scans a hooks module before loading it and
  refuses three shapes the brief's layout implies:
  - `$` passed into a function imported from another file (`$ is followed only
    into a function declared in this same file, never across an import`);
  - an atom used outside the file that declares it (`update takes a source the
    scan can read`);
  - the same event hooked twice without a matcher, even from two files.
- **Instead**:
  - `src/collectors/*.ts` are pure: they parse what `$` answered and reduce it
    into state (git output, usage, steps, agents, files). They are unit-tested
    directly.
  - `src/engine.tsx` holds every hook, every atom and every `$` call: it asks,
    hands the answer to a collector, and writes the result.
  - `src/render/**` is pure: it takes the data the engine's `ui.render` hook
    read, plus press handlers the engine built, and returns the tree.
  - `src/state.ts` keeps the defaults and the `$.store` keys.
  - `hooks/register.ts` stays wiring only: `on(event, hook)` lines.

### Render files are `.tsx`

- **Brief**: `src/render/pane.ts`, `tabs/*.ts`, ...
- **Why**: those files draw with JSX, which TypeScript only reads in `.tsx`.
- **Instead**: the same names with `.tsx`.

## Pane chrome

### Title and status sit on the first body row

- **Mockup**: `CLAUDE HUD v0.1` on the top border at the left, `● live` on the
  border at the right.
- **Why not**: the engine draws the pane's frame and close mark; a hook draws
  only the body.
- **Instead**: the first body row carries the name, the version and the live
  mark (`● live` while a turn runs, `○ idle` otherwise).

### Rules between sections span the body, without `├ ┤` joints

- **Mockup**: `├────┤` rules that join the gold frame.
- **Why not**: the frame is the engine's, so there is nothing to join.
- **Instead**: full-width `─` rules in the line color.

### Tab hotkeys are drawn by the engine

- **Mockup**: ` 1: Home ` inverse red as one chip.
- **Why not**: a `plain` Button with a `hotkey` is drawn by the engine as
  `1: ` followed by its label; the plugin styles only the label part.
- **Instead**: the label (` Home `) carries the inverse red chip; the engine's
  `1: ` sits before it in its own style.

### The panel surface is not painted

- **Mockup**: the panel is filled with Dark `#2B2A29`.
- **Why not**: a pane's body sits on the terminal's own background; filling
  every cell would fight light terminals and the engine's frame.
- **Instead**: the terminal's background shows through. A light terminal can
  use the `pyra-light` theme (`userConfig.theme`), mapped from the design
  system's `pyra-light` tokens.

## Home (1a)

### Radar and sparkline labels inside a Raster are not bold

- **Mockup**: radar values (`71%`, `0.42`) bold.
- **Why not**: the radar and its labels are one `Raster` so each label sits
  exactly at its vertex; a Raster cell has a glyph and two colors, no weight.
- **Instead**: values in primary text, labels dim. On the desktop the radar is
  an `Svg` with bold values.

### Raster colors are rounded

- **Mockup**: exact hex per cell.
- **Why not**: the terminal's Raster palette paints 1,024 distinct color pairs
  and rounds the rest to the nearest.
- **Instead**: the HUD keeps to the design's few colors, so rounding is rare.

### `Lv.` is defined by the mod

- **Mockup**: `Lv. 12` with no data behind it.
- **Instead**: `⌊√(turns this mod has seen end, across sessions)⌋`, counted
  from `turn.complete` and kept in `$.store` (documented in DATA-SOURCES.md).
  No figure is invented: it is a count of real turns.

### Usage stamp

- **Mockup**: `summary · 12s ago`.
- **Instead**: the same words; `summary` (or `full` after a precise recount)
  is how the /context breakdown was counted, the age is of the last usage read
  (`session.measure`, `turn.complete`), advanced by a 10 s clock.

### Desktop fallbacks

- `Raster` and `Image` are terminal-only. On the desktop app (and other
  remote surfaces) Clawd is an `Svg` of the same pixels, the radar an `Svg`,
  and the sparkline the same glyphs as text.

## Context (1b)

### Category colors follow the mockup by name

- **Mockup**: the `CAT` table's colors per category.
- **How**: the engine names each category (`System prompt`, `MCP tools`, ...)
  and gives a theme key (`promptBorder`, `permission`, ...) meant for its own
  theme. The HUD keeps the mockup's color for each name it knows, the free
  space and buffer patterns by the category's `kind` (`free`, `buffer`), and
  a fixed extra palette for any category the mockup does not name.

### The grid can be hidden

- **Brief**: "optional /context grid". The mockup shows it with no control.
- **Instead**: shown by default, with a `[ Hide grid ]` / `[ Grid ]` button
  beside **Precise recount**. Without it the legend spans the width.
- A partly filled square draws `□` (as /context draws it hollow under 70%).

### MCP servers open to their tools

- **Mockup**: `▸ github` rows with no defined content.
- **Instead**: pressing a server lists its tools and tokens; deferred tools
  (outside the window) are marked and dim, and the server row says how many
  are deferred.

### Compaction marker

- **Mockup**: none.
- **Instead**: once the conversation was compacted, the title's note ends with
  `· ⟲N` (N compactions this session).

### Legend names may end in `…`

- **Mockup**: `Autocompact buffer` runs into its token count at 52 columns.
- **Instead**: the name is cut with `…` so the counts keep one space.

### Files outside the repository and outside git

- **Mockup**: one repository tree.
- **Instead**: a file outside the repository root is listed under
  `(outside repo)/` by its file name. Outside a git repository there is no
  tracked list, so the tree holds only touched files and the title reads
  `untouched n/a`.
