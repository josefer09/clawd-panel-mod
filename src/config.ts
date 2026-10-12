// The plugin's userConfig values, set once per load by `register` and read by
// the hooks. A change in /config reloads the module, so they never go stale.

import type { PluginOptions } from 'claude-code'

import type { ThemeName } from './theme'

export type Config = {
  /** The name drawn at the top of the pane. */
  title: string
  theme: ThemeName
  /** Context fill (%) at or above which the alert shows. */
  alertThreshold: number
  /** Columns the pane asks for when docked. */
  dockColumns: number
}

export const VERSION = '0.2.0'

let current: Config = { title: 'Claude HUD', theme: 'pyra', alertThreshold: 90, dockColumns: 56 }

export function configure(options: PluginOptions): Config {
  const title = typeof options.title === 'string' && options.title.trim() !== '' ? options.title.trim() : 'Claude HUD'
  const theme: ThemeName = options.theme === 'pyra-light' ? 'pyra-light' : 'pyra'
  const threshold = typeof options.alertThreshold === 'number' ? options.alertThreshold : 90
  const dock = typeof options.dockColumns === 'number' ? options.dockColumns : 56
  current = {
    title,
    theme,
    alertThreshold: Math.max(1, Math.min(100, threshold)),
    dockColumns: Math.max(40, Math.min(120, Math.round(dock))),
  }
  return current
}

export function config(): Config {
  return current
}
