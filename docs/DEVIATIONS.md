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
