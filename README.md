# clawd-panel

A Claude Code **mod** that adds a HUD pane beside the transcript: session usage,
context breakdown, subagents, git, and Clawd, a pixel-art avatar.

> Work in progress. See [CHANGELOG.md](CHANGELOG.md).

## Requirements

- Claude Code v2.1.287 or later (`claude --version`). Built and tested on 2.1.296.

## Run it from this folder

```sh
claude --plugin-dir ./clawd-panel-mod
```

Then type `/clawd` at the prompt.

## Commands

| Command | What it does |
| --- | --- |
| `/clawd` | Toggles the pane. Focused on open; Esc closes it. |
| `/clawd <tab>` | Opens the pane on `home`, `context`, `agents`, `git` or `avatar`. |
| `/clawd-band` | Toggles the one-line band above the prompt. |

## Local scripts

No CI: run these before committing.

```sh
./scripts/check.sh                                # all three below
npx --yes -p typescript@5.6.3 tsc -p .            # type-check against .claude/types
claude plugin validate . --strict                 # what the engine reads, zero warnings
claude plugin test .                              # tests/*.test.ts
```

`.claude/types/claude-code.d.ts` is the API declaration file written by
Claude Code 2.1.296 (the `plugin-authoring` skill's copy). Replace it after an
upgrade, then run the checks again.
