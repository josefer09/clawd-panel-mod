# clawd-panel

**Claude HUD** for Claude Code: a mod that docks a heads-up display beside the
transcript, with your session's usage, the context window by category,
subagents, git, and Clawd, a pixel-art avatar that reacts to what Claude is
doing.

Every figure is one Claude Code reports through the mods API (or git's own
output). Nothing is estimated or priced by the mod; where the API exposes no
figure the HUD shows `—` or `n/a`. See [docs/DATA-SOURCES.md](docs/DATA-SOURCES.md).

## Install

In a Claude Code session in a terminal:

```text
/plugin install clawd-panel --marketplace josefer09/clawd-panel-mod
```

Answer `y` to add the marketplace, then pick a scope (the user scope is first).
The mod is active at once, and in every session started after under that scope.

Or run it from a clone for one session:

```sh
git clone https://github.com/josefer09/clawd-panel-mod.git
claude --plugin-dir ./clawd-panel-mod
```

Requires Claude Code **v2.1.287** or later (`claude --version`). Built and
tested on 2.1.296.

## Use

| Command | What it does |
| --- | --- |
| `/clawd` | Toggles the HUD pane. It opens focused; Esc closes it. Runs even while Claude works. |
| `/clawd <tab>` | Opens the pane on `home`, `context`, `agents`, `git` or `avatar`. |
| `/clawd-band` | Toggles a one-line band above the prompt: branch, model, effort, context, 5h window, cost. |

In the pane, `1`–`5` switch tabs, Tab walks the buttons, ↑↓ scroll, Ctrl+X ←→
resizes, Esc closes. The pane docks on the right in a wide fullscreen terminal
(≥ 110 columns) and sits above the prompt otherwise.

### Tabs

- **Home**: branch, model, effort, duration and turns; context, 5-hour and
  weekly meters with reset times; session cost; Clawd; a radar of context %,
  5h %, 7d %, cache-hit % and output/input; cost per turn.
- **Context**: the window by category as `/context` counts it (bar, grid,
  legend), **Precise recount** (a `full` count, which sends token-count
  requests), MCP servers and tools, memory files, skills, custom agents, and a
  tree of the files the session read, edited or left untouched.
- **Agents**: every subagent with status, tokens and time; open one for its
  model, effort, branch or worktree, cwd, background and fork flags, parent,
  token breakdown, context fill, task prompt and the files it touched.
- **Git**: branch with ahead/behind, changes with lines added and removed,
  local branches and worktrees, and the commit graph.
- **Avatar**: Clawd's preview and frames, a custom sprite or sprite sheet
  (PNG), and the render mode.

### Avatar

Clawd is drawn as an `Image` where the terminal shows pictures (kitty 0.28+,
Ghostty; not inside tmux or screen) and as half-block cells elsewhere. Pick
`Auto`, `Image` or `Pixel cells` on the Avatar tab. Load your own:

- **Sprite path**: one PNG for every state.
- **Sheet**: a PNG grid, `Frames/row` frames across, one row per state in the
  order idle, thinking, tool, done. [`assets/clawd-sheet.png`](assets/clawd-sheet.png)
  is an example (4 × 4 frames of 24×28).

Only the paths are saved, never the image.

## Settings

Set in `/config` (or `/plugin configure clawd-panel@clawd-panel-mod`):

| Setting | Default | What it does |
| --- | --- | --- |
| `title` | `Claude HUD` | The name at the top of the pane. |
| `theme` | `pyra` | `pyra` (dark, as designed) or `pyra-light` for light terminals. |
| `alertThreshold` | `90` | Context % at which the meters turn inverse red and a toast shows once. |
| `dockColumns` | `56` | Columns the pane asks for when docked. |

## What is not shown, and why

- No cost per subagent and no tokens per file: the API does not expose them.
- A subagent's context fill is in tokens, not %: its window is not exposed.
- Grep, Glob and Bash are not counted as reading a file.

Every difference from the design mockup is listed in
[docs/DEVIATIONS.md](docs/DEVIATIONS.md).

## Develop

The hooks module is `hooks/register.ts` (wiring only). `src/engine.tsx` holds
every hook and every `$` call (the engine's scanner follows `$` only within one
file); `src/collectors/` parse and reduce what the API reports; `src/render/`
builds the trees. `types/index.d.ts` declares the `$.state` values.

No CI: run the checks locally before committing.

```sh
./scripts/check.sh                                # all three below
npx --yes -p typescript@5.6.3 tsc -p .            # type-check against .claude/types
claude plugin validate . --strict                 # what the engine reads, zero warnings
claude plugin test .                              # tests/*.test.ts
bun scripts/build-assets.ts                       # re-render assets/ and tests/fixtures.ts
```

Run with `claude --debug --plugin-dir .` to see a skipped hook or a refused
tree in the debug log. `.claude/types/claude-code.d.ts` is the declaration file
Claude Code 2.1.296 writes; replace it after an upgrade and run the checks.

## License

MIT
