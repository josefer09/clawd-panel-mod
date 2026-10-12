// Which terminal the session runs in, from its environment, and whether an
// `Image` can draw pixels there. Claude Code draws `Image` through the kitty
// graphics protocol with Unicode placeholders, which it detects in kitty 0.28+
// and Ghostty, never inside tmux or screen; elsewhere it draws the `alt` text.
// `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` skips that detection.

export type TerminalEnv = {
  TERM_PROGRAM?: string
  TERM?: string
  TMUX?: string
  STY?: string
  KITTY_WINDOW_ID?: string
  GHOSTTY_RESOURCES_DIR?: string
  CLAUDE_CODE_FORCE_TERMINAL_IMAGES?: string
}

export type Terminal = { name: string; images: boolean }

export function detectTerminal(env: TerminalEnv): Terminal {
  const multiplexer = env.TMUX ? 'tmux' : env.STY ? 'screen' : undefined
  const program = (env.TERM_PROGRAM ?? '').toLowerCase()
  const term = (env.TERM ?? '').toLowerCase()
  let name = env.TERM_PROGRAM || env.TERM || 'unknown'
  let images = false
  if (program === 'ghostty' || env.GHOSTTY_RESOURCES_DIR || term === 'xterm-ghostty') {
    name = 'ghostty'
    images = true
  } else if (env.KITTY_WINDOW_ID || term === 'xterm-kitty') {
    name = 'kitty'
    images = true
  } else if (program === 'iterm.app') {
    name = 'iTerm2'
  } else if (program === 'wezterm') {
    name = 'WezTerm'
  } else if (term.startsWith('foot')) {
    name = 'foot'
  }
  if (multiplexer) {
    name = `${name} in ${multiplexer}`
    images = false
  }
  if (env.CLAUDE_CODE_FORCE_TERMINAL_IMAGES === '1') images = true
  return { name, images }
}

/** The stored terminal word: its name, and `+img` when an Image draws pixels there. */
export function terminalWord(t: Terminal): string {
  return t.images ? `${t.name} +img` : t.name
}

export function parseTerminalWord(word: string): Terminal {
  return word.endsWith(' +img') ? { name: word.slice(0, -5), images: true } : { name: word || 'unknown', images: false }
}
