// clawd-panel: wiring only. Each event is hooked once, by a hook in
// src/engine.tsx; the module's options are read once per load.

import type { Register } from 'claude-code'

import { configure } from '../src/config'
import { drawPane, onCommand, onSessionReset, onSessionStart } from '../src/engine'

export const register: Register = (on, options) => {
  configure(options)

  on('session.start', onSessionStart)
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, onSessionReset).catch(($, e, next) => next(e))
  on('command.run', { command: ['clawd', 'clawd-band'] }, onCommand)
  on('ui.render', { component: 'Pane', requestId: 'clawd' }, drawPane)
}
