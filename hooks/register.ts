// clawd-panel: wiring only. Each event is hooked once, by a hook in
// src/engine.tsx; the module's options are read once per load.

import type { Register } from 'claude-code'

import { configure } from '../src/config'
import {
  drawPane,
  onCommand,
  onCompact,
  onMeasure,
  onSessionStart,
  onSessionStartClassic,
  onSpawn,
  onStep,
  onToolCall,
  onTurnComplete,
  onTurnStart,
} from '../src/engine'

export const register: Register = (on, options) => {
  configure(options)

  on('session.start', onSessionStart)
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork', 'compact'] }, onSessionStartClassic).catch(($, e, next) => next(e))
  on('session.measure', onMeasure)
  on('session.compact', onCompact).catch(($, e, next) => next(e))
  on('turn.start', onTurnStart)
  on('turn.step', onStep)
  on('turn.complete', onTurnComplete)
  on('tool.call', onToolCall).catch(($, e, next) => next(e))
  on('agent.spawn', onSpawn).catch(($, e, next) => next(e))
  on('command.run', { command: ['clawd', 'clawd-band'] }, onCommand)
  on('ui.render', { component: 'Pane', requestId: 'clawd' }, drawPane)
}
